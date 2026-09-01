"use client";

import { resetCommerce } from "@/components/commerce-state";

let activeLogout: Promise<void> | null = null;

function safeTarget(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function clearClientSessionState() {
  resetCommerce();
  try { window.localStorage.removeItem("meras_session_token"); } catch { /* Storage can be unavailable in private mode. */ }
  try { window.sessionStorage.removeItem("meras_return_to"); } catch { /* Storage can be unavailable in private mode. */ }
  window.dispatchEvent(new CustomEvent("meras:notifications-read", { detail: { unread: 0 } }));
}

export function signOutWeb(to = "/") {
  if (activeLogout) return activeLogout;
  const target = safeTarget(to);
  clearClientSessionState();
  activeLogout = (async () => {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("logout_failed");
      window.location.replace(target);
    } catch {
      const payload = new Blob([], { type: "application/json" });
      const queued = typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/auth/logout", payload);
      if (!queued) {
        void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store", keepalive: true, headers: { accept: "application/json" } }).catch(() => undefined);
      }
      window.location.replace(target);
    }
  })();
  return activeLogout;
}
