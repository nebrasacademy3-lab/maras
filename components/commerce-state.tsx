"use client";

import { useSyncExternalStore } from "react";

type CommerceState = { cartSlugs: string[]; favoriteSlugs: string[]; loaded: boolean; loading: boolean };
const emptyState: CommerceState = { cartSlugs: [], favoriteSlugs: [], loaded: false, loading: false };
let state = emptyState;
let request: Promise<void> | null = null;
let requestController: AbortController | null = null;
let generation=0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const normalize = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function getCommerceSnapshot() { return state; }
export function subscribeCommerce(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function ensureCommerceLoaded() {
  if (state.loaded || request) return request;
  state = { ...state, loading: true };
  emit();
  const requestGeneration=generation; const controller=new AbortController(); requestController=controller;
  request = Promise.all([
    fetch("/api/cart", { credentials: "same-origin", cache: "no-store", signal:controller.signal }).then(async (response) => response.ok ? await response.json() as { courseSlugs?: unknown[] } : null).catch(() => null),
    fetch("/api/favorites", { credentials: "same-origin", cache: "no-store", signal:controller.signal }).then(async (response) => response.ok ? await response.json() as { courseSlugs?: unknown[] } : null).catch(() => null),
  ]).then(([cart, favorites]) => {
    if(controller.signal.aborted||requestGeneration!==generation)return;
    state = { cartSlugs: normalize(cart?.courseSlugs), favoriteSlugs: normalize(favorites?.courseSlugs), loaded: true, loading: false };
    emit();
  }).finally(() => { if(requestGeneration===generation){request = null; requestController=null;} });
  return request;
}

export function useCommerceState() {
  const snapshot = useSyncExternalStore(subscribeCommerce, getCommerceSnapshot, () => emptyState);
  return snapshot;
}

export function resetCommerce() { generation++; requestController?.abort(); requestController=null; request=null; state = emptyState; emit(); }

export function syncCommerce(next: Partial<Pick<CommerceState, "cartSlugs" | "favoriteSlugs">>) {
  state = { ...state, ...next, loaded: true, loading: false };
  emit();
}

export async function setFavorite(courseSlug: string, active: boolean) {
  const expectedGeneration=generation;
  const response = await fetch("/api/favorites", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseSlug, active }) });
  const payload = await response.json() as { courseSlugs?: unknown[]; error?: string };
  if (!response.ok) throw new Error(response.status === 401 ? "401: سجّل الدخول أولًا" : payload.error || "تعذر تحديث المفضلة");
  if(expectedGeneration!==generation)throw new Error("تغيّر الحساب أو حالة السلة؛ لم نعرض بيانات الطلب السابق");
  syncCommerce({ favoriteSlugs: normalize(payload.courseSlugs) });
  return payload;
}

export async function setCart(courseSlug: string, active: boolean) {
  const expectedGeneration=generation;
  const response = await fetch("/api/cart", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseSlug, active }) });
  const payload = await response.json() as { courseSlugs?: unknown[]; error?: string };
  if (!response.ok) throw new Error(response.status === 401 ? "401: سجّل الدخول أولًا" : payload.error || "تعذر تحديث السلة");
  if(expectedGeneration!==generation)throw new Error("تغيّر الحساب أو حالة السلة؛ لم نعرض بيانات الطلب السابق");
  syncCommerce({ cartSlugs: normalize(payload.courseSlugs) });
  return payload;
}
