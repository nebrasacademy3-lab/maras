"use client";

import { useSyncExternalStore } from "react";

type CommerceState = { cartSlugs: string[]; favoriteSlugs: string[]; loaded: boolean; loading: boolean };
const emptyState: CommerceState = { cartSlugs: [], favoriteSlugs: [], loaded: false, loading: false };
let state = emptyState;
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const normalize = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function getCommerceSnapshot() { return state; }
export function subscribeCommerce(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function ensureCommerceLoaded() {
  if (state.loaded || request) return request;
  state = { ...state, loading: true };
  emit();
  request = Promise.all([
    fetch("/api/cart", { credentials: "same-origin", cache: "no-store" }).then(async (response) => response.ok ? await response.json() as { courseSlugs?: unknown[] } : null).catch(() => null),
    fetch("/api/favorites", { credentials: "same-origin", cache: "no-store" }).then(async (response) => response.ok ? await response.json() as { courseSlugs?: unknown[] } : null).catch(() => null),
  ]).then(([cart, favorites]) => {
    state = { cartSlugs: normalize(cart?.courseSlugs), favoriteSlugs: normalize(favorites?.courseSlugs), loaded: true, loading: false };
    emit();
  }).finally(() => { request = null; });
  return request;
}

export function useCommerceState() {
  const snapshot = useSyncExternalStore(subscribeCommerce, getCommerceSnapshot, () => emptyState);
  return snapshot;
}

export function resetCommerce() { state = emptyState; emit(); }

export function syncCommerce(next: Partial<Pick<CommerceState, "cartSlugs" | "favoriteSlugs">>) {
  state = { ...state, ...next, loaded: true, loading: false };
  emit();
}

export async function setFavorite(courseSlug: string, active: boolean) {
  const response = await fetch("/api/favorites", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseSlug, active }) });
  const payload = await response.json() as { courseSlugs?: unknown[]; error?: string };
  if (!response.ok) throw new Error(response.status === 401 ? "401: سجّل الدخول أولًا" : payload.error || "تعذر تحديث المفضلة");
  syncCommerce({ favoriteSlugs: normalize(payload.courseSlugs) });
  return payload;
}

export async function setCart(courseSlug: string, active: boolean) {
  const response = await fetch("/api/cart", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseSlug, active }) });
  const payload = await response.json() as { courseSlugs?: unknown[]; error?: string };
  if (!response.ok) throw new Error(response.status === 401 ? "401: سجّل الدخول أولًا" : payload.error || "تعذر تحديث السلة");
  syncCommerce({ cartSlugs: normalize(payload.courseSlugs) });
  return payload;
}
