"use client";

import { useSyncExternalStore } from "react";

type CommerceState = { cartSlugs: string[]; favoriteSlugs: string[]; loaded: boolean; loading: boolean };
type CommerceField = "cartSlugs" | "favoriteSlugs";
const emptyState: CommerceState = { cartSlugs: [], favoriteSlugs: [], loaded: false, loading: false };
let state = emptyState;
let request: Promise<void> | null = null;
let requestController: AbortController | null = null;
let generation = 0;
let revisions: Record<CommerceField, number> = { cartSlugs: 0, favoriteSlugs: 0 };
let known: Record<CommerceField, boolean> = { cartSlugs: false, favoriteSlugs: false };
type MutationPayload = { courseSlugs?: unknown[]; error?: string };
let mutationTails: Partial<Record<CommerceField, Promise<MutationPayload>>> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const normalize = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function getCommerceSnapshot() { return state; }
/** Async consumers capture this before a request so old account responses cannot repopulate the store. */
export function getCommerceGeneration() { return generation; }
export function subscribeCommerce(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function ensureCommerceLoaded() {
  if (state.loaded || request || state.loading) return request;
  const requestGeneration = generation, before = { ...revisions };
  const controller = new AbortController();
  requestController = controller;
  state = { ...state, loading: true };
  emit();
  const read = async (path: string) => {
    try {
      const response = await fetch(path, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok) return null;
      const payload = await response.json() as { courseSlugs?: unknown };
      return Array.isArray(payload?.courseSlugs) && payload.courseSlugs.every(item => typeof item === "string") ? payload.courseSlugs as string[] : null;
    } catch { return null; }
  };
  request = Promise.all([read("/api/cart"), read("/api/favorites")]).then(([cart, favorites]) => {
    if (controller.signal.aborted || requestGeneration !== generation) return;
    const updates: Partial<Pick<CommerceState, CommerceField>> = {};
    for (const [field, value] of [["cartSlugs", cart], ["favoriteSlugs", favorites]] as const) {
      // Initial reads may finish after a successful user action. Never overwrite the newer field.
      if (value !== null && before[field] === revisions[field]) {
        updates[field] = value;
        known[field] = true;
      }
    }
    state = { ...state, ...updates, loaded: known.cartSlugs && known.favoriteSlugs, loading: false };
    emit();
  }).finally(() => {
    if (requestGeneration === generation) { request = null; requestController = null; }
  });
  return request;
}

export function useCommerceState() {
  return useSyncExternalStore(subscribeCommerce, getCommerceSnapshot, () => emptyState);
}

export function resetCommerce() {
  generation++;
  requestController?.abort();
  requestController = null;
  request = null;
  state = emptyState;
  revisions = { cartSlugs: 0, favoriteSlugs: 0 };
  known = { cartSlugs: false, favoriteSlugs: false };
  mutationTails = {};
  emit();
}

export function syncCommerce(next: Partial<Pick<CommerceState, CommerceField>>, expectedGeneration = generation) {
  if (expectedGeneration !== generation) return false;
  const updates: Partial<Pick<CommerceState, CommerceField>> = {};
  for (const field of ["cartSlugs", "favoriteSlugs"] as const) {
    if (next[field] !== undefined) {
      updates[field] = normalize(next[field]);
      revisions[field]++;
      known[field] = true;
    }
  }
  state = { ...state, ...updates, loaded: known.cartSlugs && known.favoriteSlugs, loading: Boolean(request) };
  emit();
  return true;
}

/** Serialize writes to each list so an earlier response cannot undo a later user action. */
function mutateCommerce(field: CommerceField, path: string, courseSlug: string, active: boolean, error: string) {
  const expectedGeneration = generation;
  const run = async () => {
    if (expectedGeneration !== generation) throw new Error("تغيّر الحساب أو حالة السلة؛ أعد المحاولة من الحساب الحالي");
    const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseSlug, active }) });
    const payload = await response.json() as MutationPayload;
    if (!response.ok) throw new Error(response.status === 401 ? "401: سجّل الدخول أولًا" : payload?.error || error);
    if (expectedGeneration !== generation) throw new Error("تغيّر الحساب أو حالة السلة؛ لم نعرض بيانات الطلب السابق");
    if (!Array.isArray(payload?.courseSlugs) || !payload.courseSlugs.every(value => typeof value === "string")) throw new Error(error);
    syncCommerce({ [field]: payload.courseSlugs as string[] }, expectedGeneration);
    return payload;
  };
  const preceding = mutationTails[field];
  const pending = preceding ? preceding.catch(() => undefined).then(run) : run();
  mutationTails[field] = pending;
  // The caller observes failure; cleanup itself must never create an unhandled rejection.
  void pending.finally(() => { if (mutationTails[field] === pending) delete mutationTails[field]; }).catch(() => undefined);
  return pending;
}

export function setFavorite(courseSlug: string, active: boolean) {
  return mutateCommerce("favoriteSlugs", "/api/favorites", courseSlug, active, "تعذر تحديث المفضلة");
}

export function setCart(courseSlug: string, active: boolean) {
  return mutateCommerce("cartSlugs", "/api/cart", courseSlug, active, "تعذر تحديث السلة");
}
