import * as SecureStore from "expo-secure-store";
import { FIRST_RUN_ONBOARDING_KEY } from "@/src/components/PlatformControls";
import { api } from "@/src/lib/api";
import type { SessionUser } from "@/src/types";

export const ONBOARDING_SYNC_PENDING_KEY = "meras_onboarding_sync_pending_v1";

type PendingOnboardingSync = { userId: number; email: string };

async function saveLocalCompletion() {
  try { await SecureStore.setItemAsync(FIRST_RUN_ONBOARDING_KEY, "completed"); } catch { /* Server state or the pending marker can still prevent a loop. */ }
}

async function savePending(user: SessionUser) {
  const value: PendingOnboardingSync = { userId: user.id, email: user.email };
  try { await SecureStore.setItemAsync(ONBOARDING_SYNC_PENDING_KEY, JSON.stringify(value)); } catch { /* A later server next gate will retry if secure storage is unavailable. */ }
}

async function clearPending() {
  try { await SecureStore.deleteItemAsync(ONBOARDING_SYNC_PENDING_KEY); } catch { /* A stale marker is harmless and will be cleared on the next successful reconciliation. */ }
}

async function pendingFor(user: SessionUser) {
  try {
    const value = await SecureStore.getItemAsync(ONBOARDING_SYNC_PENDING_KEY);
    if (!value) return false;
    const pending = JSON.parse(value) as Partial<PendingOnboardingSync>;
    return pending.userId === user.id && pending.email === user.email;
  } catch { return false; }
}

export async function completeGuestOnboarding() {
  await saveLocalCompletion();
}

export async function syncOnboardingCompletion(user: SessionUser) {
  if (user.onboardingCompleted) {
    await saveLocalCompletion();
    await clearPending();
    return true;
  }
  try {
    await api("/api/profile/onboarding", { method: "POST" });
    await saveLocalCompletion();
    await clearPending();
    return true;
  } catch {
    await savePending(user);
    await saveLocalCompletion();
    return false;
  }
}

export async function reconcileOnboardingCompletion(user: SessionUser) {
  if (user.onboardingCompleted) {
    await saveLocalCompletion();
    if (await pendingFor(user)) await clearPending();
    return true;
  }
  if (!(await pendingFor(user))) return false;
  return syncOnboardingCompletion(user);
}
