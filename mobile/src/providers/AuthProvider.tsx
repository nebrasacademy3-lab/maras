import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, jsonBody, setApiToken } from "@/src/lib/api";
import type { SessionUser } from "@/src/types";

const TOKEN_KEY = "meras_session_token";
type Credentials = { identifier: string; password: string; remember?: boolean };
type Registration = { fullName: string; email: string; phone: string; password: string; universitySlug: string; specialty: string; academicLevel: string; termsAccepted: true };
type AuthResponse = { ok: true; token: string; expiresAt: string; user: SessionUser; next: string };
type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  token: string | null;
  login: (value: Credentials) => Promise<AuthResponse>;
  register: (value: Registration) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<SessionUser | null>;
  setUser: React.Dispatch<React.SetStateAction<SessionUser | null>>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

async function persistToken(value: string | null) {
  setApiToken(value);
  if (value) await SecureStore.setItemAsync(TOKEN_KEY, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function clearPersistedToken() {
  setApiToken(null);
  try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch { /* Local state is still cleared if the OS secure store is temporarily unavailable. */ }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const response = await api<{ ok: true; user: SessionUser }>("/api/auth/me");
      setUser(response.user);
      return response.user;
    } catch (reason) {
      setUser(null);
      if (reason instanceof ApiError && reason.status === 401) {
        await clearPersistedToken();
        setToken(null);
      }
      return null;
    }
  }, []);
  useEffect(() => {
    void (async () => {
      const saved = await SecureStore.getItemAsync(TOKEN_KEY);
      if (saved) { setToken(saved); setApiToken(saved); await refresh(); }
      setLoading(false);
    })();
  }, [refresh]);
  const accept = useCallback(async (response: AuthResponse) => {
    await persistToken(response.token); setToken(response.token); setUser(response.user); return response;
  }, []);
  const login = useCallback(async (value: Credentials) => accept(await api<AuthResponse>("/api/mobile/auth/login", { method: "POST", body: jsonBody(value) })), [accept]);
  const register = useCallback(async (value: Registration) => accept(await api<AuthResponse>("/api/mobile/auth/register", { method: "POST", body: jsonBody(value) })), [accept]);
  const logout = useCallback(async () => {
    try { await api("/api/mobile/auth/logout", { method: "POST" }); } catch { /* Local logout must still succeed. */ }
    finally { await clearPersistedToken(); setToken(null); setUser(null); }
  }, []);
  const value = useMemo(() => ({ user, loading, token, login, register, logout, refresh, setUser }), [user, loading, token, login, register, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}

