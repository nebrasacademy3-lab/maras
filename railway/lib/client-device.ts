"use client";

const DEVICE_KEY = "meras_device_id";

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `web-${crypto.randomUUID()}`;
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

export function webDeviceHeaders() {
  if (typeof window === "undefined") return {} as Record<string, string>;
  let id = "";
  try {
    id = window.localStorage.getItem(DEVICE_KEY) || "";
    if (!id) {
      id = randomId();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
  } catch {
    id = randomId();
  }
  const platform = navigator.platform || "Web";
  const browser = /Edg\//.test(navigator.userAgent) ? "Edge" : /Chrome\//.test(navigator.userAgent) ? "Chrome" : /Firefox\//.test(navigator.userAgent) ? "Firefox" : /Safari\//.test(navigator.userAgent) ? "Safari" : "Browser";
  return {
    "x-meras-device-id": id,
    "x-meras-device-label": `${browser} · ${platform}`.slice(0, 100),
    "x-meras-platform": "web",
  };
}
