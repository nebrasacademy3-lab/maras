import * as SecureStore from "expo-secure-store";
import * as Notifications from "expo-notifications";
import { api, jsonBody } from "@/src/lib/api";

const PUSH_TOKEN_KEY = "meras_expo_push_token";
let registrationGeneration = 0;
const registrationControllers = new Set<AbortController>();

export function startPushRegistration() {
  const generation = registrationGeneration;
  const controller = new AbortController();
  registrationControllers.add(controller);
  return {
    signal: controller.signal,
    active: () => generation === registrationGeneration && !controller.signal.aborted,
    cancel: () => { controller.abort(); registrationControllers.delete(controller); },
    finish: () => registrationControllers.delete(controller),
  };
}

export function cancelPendingPushRegistrations() {
  registrationGeneration += 1;
  for (const controller of registrationControllers) controller.abort();
  registrationControllers.clear();
}

export async function rememberExpoPushToken(token: string, active: () => boolean = () => true) {
  if (!active()) return false;
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  if (active()) return true;
  await forgetRememberedExpoPushToken(token);
  return false;
}

export async function forgetRememberedExpoPushToken(expectedToken: string) {
  try {
    const current = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
    if (current === expectedToken) await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  } catch { /* A later logout attempt can retry secure-store cleanup. */ }
}

/**
 * Revokes the token while the current Bearer session is still available.
 * A network failure must never prevent local logout from completing.
 */
export async function revokeRememberedExpoPushToken(): Promise<string | null> {
  let token: string | null = null;
  try { token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY); } catch { /* OS cleanup still runs below. */ }

  if (token) try {
    await api("/api/mobile/push", {
      method: "DELETE",
      body: jsonBody({ token }),
      timeoutMs: 4_000,
    });
  } catch {
    // The server also replaces ownership when this device registers again.
  }
  try { await Notifications.unregisterForNotificationsAsync(); } catch { /* Server revocation remains the primary cleanup. */ }
  try { await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY); } catch { /* Local logout continues. */ }
  return token;
}
