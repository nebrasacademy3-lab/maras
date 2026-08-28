import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, getApiToken, jsonBody, setApiToken } from "@/src/lib/api";
import { persistThenCommit } from "@/src/lib/atomicPersistence";
import { reconcileOnboardingCompletion } from "@/src/lib/onboardingSync";
import { cancelPendingPushRegistrations, revokeRememberedExpoPushToken } from "@/src/lib/pushRegistration";
import type { SessionUser } from "@/src/types";

const TOKEN_KEY = "meras_session_token";
const USER_KEY = "meras_session_user";
type Credentials = { identifier: string; password: string; remember?: boolean };
type Registration = { fullName: string; email: string; phone: string; password: string; universitySlug: string; specialty: string; academicLevel: string; termsAccepted: true };
type AuthResponse = { ok: true; token: string; expiresAt: string; user: SessionUser; next: string };
type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  offline: boolean;
  authError: string;
  token: string | null;
  login: (value: Credentials) => Promise<AuthResponse>;
  register: (value: Registration) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<SessionUser | null>;
  setUser: React.Dispatch<React.SetStateAction<SessionUser | null>>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

async function persistToken(value: string | null) {
  const previous = getApiToken();
  await persistThenCommit(
    () => value
      ? SecureStore.setItemAsync(TOKEN_KEY, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY })
      : SecureStore.deleteItemAsync(TOKEN_KEY),
    () => setApiToken(value),
    () => setApiToken(previous),
  );
}

async function persistUser(value: SessionUser) {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(value), { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
}

function parsePersistedUser(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SessionUser>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "number" || typeof parsed.email !== "string" || typeof parsed.fullName !== "string") return null;
    return parsed as SessionUser;
  } catch { return null; }
}

async function clearPersistedSession() {
  setApiToken(null);
  await Promise.allSettled([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(USER_KEY)]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [authError, setAuthError] = useState("");
  const userRef = useRef<SessionUser | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await api<{ ok: true; user: SessionUser }>("/api/auth/me");
      userRef.current = response.user;
      setUser(response.user);
      setOffline(false);
      setAuthError("");
      setLoading(false);
      try { await persistUser(response.user); } catch { /* The live verified session remains usable if secure storage is unavailable. */ }
      void reconcileOnboardingCompletion(response.user);
      return response.user;
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        await clearPersistedSession();
        userRef.current = null;
        setUser(null);
        setToken(null);
        setOffline(false);
        setAuthError("");
        setLoading(false);
        return null;
      }
      setOffline(true);
      setAuthError(reason instanceof ApiError ? reason.message : "تعذر التحقق من الجلسة. سنحاول مجددًا عند عودة الاتصال.");
      setLoading(false);
      return userRef.current;
    }
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        const [savedToken, savedUserValue] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(USER_KEY)]);
        const savedUser = parsePersistedUser(savedUserValue);
        if (!savedToken) {
          if (savedUserValue) void SecureStore.deleteItemAsync(USER_KEY).catch(() => undefined);
          setLoading(false);
          return;
        }
        setToken(savedToken);
        setApiToken(savedToken);
        if (savedUser) {
          userRef.current = savedUser;
          setUser(savedUser);
          setLoading(false);
        }
        await refresh();
      } catch {
        setOffline(true);
        setAuthError("تعذر قراءة الجلسة المحفوظة من الجهاز.");
        setLoading(false);
      }
    })();
  }, [refresh]);
  useEffect(() => {
    if (!offline || !token) return;
    const timer = setInterval(() => { void refresh(); }, 15_000);
    return () => clearInterval(timer);
  }, [offline, refresh, token]);
  const accept = useCallback(async (response: AuthResponse) => {
    await persistToken(response.token);
    try { await persistUser(response.user); } catch { /* Authentication succeeds even if the optional cached user cannot be written. */ }
    userRef.current = response.user;
    setToken(response.token);
    setUser(response.user);
    setOffline(false);
    setAuthError("");
    setLoading(false);
    return response;
  }, []);
  const login = useCallback(async (value: Credentials) => accept(await api<AuthResponse>("/api/mobile/auth/login", { method: "POST", body: jsonBody(value) })), [accept]);
  const register = useCallback(async (value: Registration) => accept(await api<AuthResponse>("/api/mobile/auth/register", { method: "POST", body: jsonBody(value) })), [accept]);
  const logout = useCallback(async () => {
    cancelPendingPushRegistrations();
    let pushToken: string | null = null;
    try { pushToken = await revokeRememberedExpoPushToken(); } catch { /* Push cleanup is best effort. */ }
    try { await api("/api/mobile/auth/logout", { method: "POST", body: jsonBody(pushToken ? { pushToken } : {}), timeoutMs: 5_000 }); } catch { /* Local logout must still succeed. */ }
    finally { await clearPersistedSession(); userRef.current = null; setToken(null); setUser(null); setOffline(false); setAuthError(""); setLoading(false); }
  }, []);
  const updateUser = useCallback<React.Dispatch<React.SetStateAction<SessionUser | null>>>((value) => {
    setUser((current) => {
      const next = typeof value === "function" ? value(current) : value;
      userRef.current = next;
      if (next) void persistUser(next).catch(() => undefined);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ user, loading, offline, authError, token, login, register, logout, refresh, setUser: updateUser }), [user, loading, offline, authError, token, login, register, logout, refresh, updateUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}
