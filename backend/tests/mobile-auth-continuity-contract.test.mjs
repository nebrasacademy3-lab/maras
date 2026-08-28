import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const backendRoot = new URL("..", import.meta.url);
const mobileRoot = new URL("../../mobile/", import.meta.url);
const readMobile = (relative) => readFile(new URL(relative, mobileRoot), "utf8");
const readBackend = (relative) => readFile(new URL(relative, backendRoot), "utf8");

test("Expo return_to is an allowlisted route, never an arbitrary router target", async () => {
  const [resolver, login, registration, profile, onboarding, learnRoom] = await Promise.all([
    readMobile("src/lib/authReturnRoute.ts"),
    readMobile("app/(auth)/login.tsx"),
    readMobile("app/(auth)/register.tsx"),
    readMobile("app/complete-profile.tsx"),
    readMobile("app/onboarding.tsx"),
    readMobile("app/learn/[slug].tsx"),
  ]);

  assert.match(resolver, /typeof value !== ["']string["']/);
  assert.match(resolver, /!value\.startsWith\(["']\/["']\)/);
  assert.match(resolver, /value\.startsWith\(["']\/\/["']\)/);
  assert.match(resolver, /value\.includes\(["']\\\\["']\)/);
  assert.match(resolver, /value\.includes\(["']\?["']\)/);
  assert.match(resolver, /value\.includes\(["']#["']\)/);
  assert.match(resolver, /CONTROL_CHARACTER\.test\(value\)/);
  assert.match(resolver, /STATIC_AUTH_RETURN_ROUTES\[value\]/);
  const staticRoutes = {
    "/account": "/(tabs)/account", "/admin": "/admin", "/cart": "/cart", "/favorites": "/favorites",
    "/learning": "/(tabs)/learning", "/notifications": "/notifications", "/orders": "/orders",
    "/profile": "/profile", "/requests": "/requests", "/security": "/security",
    "/supervisor": "/supervisor", "/support": "/support",
  };
  for (const [route, destination] of Object.entries(staticRoutes)) {
    const from = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const to = destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(resolver, new RegExp(`["']${from}["']\\s*:\\s*["']${to}["']`), `return_to mapping omits ${route} -> ${destination}`);
  }
  assert.match(resolver, /segments\[1\] === ["']course["']/);
  assert.match(resolver, /segments\[1\] === ["']learn["']/);
  assert.match(resolver, /segments\[1\] === ["']lesson["']/);
  assert.match(resolver, /COURSE_SLUG\.test\(slug\)/);
  assert.match(resolver, /LESSON_ID\.test\(lessonId\)/);
  assert.match(resolver, /return null;/);

  for (const [relative, source] of [
    ["login", login],
    ["registration", registration],
    ["complete-profile", profile],
    ["onboarding", onboarding],
  ]) {
    assert.match(source, /resolveAuthReturnRoute\(returnToParam\)/, `${relative} bypasses the shared return_to sanitizer`);
    assert.doesNotMatch(source, /router\.(?:push|replace)\(returnToParam/, `${relative} sends raw return_to to Expo Router`);
  }
  assert.match(login, /pathname:\s*["']\/\(auth\)\/register["'][\s\S]{0,100}return_to:\s*returnRoute\.path/,
    "switching from login to registration drops the sanitized return destination");
  assert.match(registration, /pathname:\s*["']\/\(auth\)\/login["'][\s\S]{0,100}return_to:\s*returnRoute\.path/,
    "switching from registration to login drops the sanitized return destination");
  assert.match(registration, /authGateHref\(["']\/complete-profile["'], returnRoute\)/);
  assert.match(registration, /authGateHref\(["']\/onboarding["'], returnRoute\)/);
  assert.match(registration, /router\.replace\(returnRoute\?\.href \|\| ["']\/\(tabs\)["']\)/,
    "successful registration drops return_to after all auth/profile gates");
  assert.match(learnRoom, /return_to:\s*`\/learn\/\$\{slug\}`/,
    "the protected learning room does not preserve its course after login");
});

test("Expo restores a validated cached account offline and clears it only after a definitive rejection", async () => {
  const auth = await readMobile("src/providers/AuthProvider.tsx");

  assert.match(auth, /TOKEN_KEY\s*=\s*["']meras_session_token["']/);
  assert.match(auth, /USER_KEY\s*=\s*["']meras_session_user["']/);
  assert.match(auth, /SecureStore\.setItemAsync\(USER_KEY, JSON\.stringify\(value\)/);
  assert.match(auth, /AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY/);
  assert.match(auth, /typeof parsed\.id !== ["']number["']/);
  assert.match(auth, /typeof parsed\.email !== ["']string["']/);
  assert.match(auth, /typeof parsed\.fullName !== ["']string["']/);
  assert.match(auth, /Promise\.all\(\[SecureStore\.getItemAsync\(TOKEN_KEY\), SecureStore\.getItemAsync\(USER_KEY\)\]\)/);

  const restoreAt = auth.indexOf("setUser(savedUser)");
  const verifyAt = auth.indexOf("await refresh()", restoreAt);
  assert.ok(restoreAt >= 0 && verifyAt > restoreAt, "the cached account is not restored before the network verification attempt");

  assert.match(auth, /reason instanceof ApiError && reason\.status === 401[\s\S]{0,260}clearPersistedSession\(\)/,
    "an explicitly rejected session is not removed from secure storage");
  assert.match(auth, /setOffline\(true\)[\s\S]{0,300}setLoading\(false\)[\s\S]{0,160}return userRef\.current/,
    "a transient network failure discards the cached authenticated account");
  assert.match(auth, /finally \{ await clearPersistedSession\(\)/,
    "explicit logout does not clear both cached credentials and identity");
});

test("Expo logout revokes the remembered push device before session teardown", async () => {
  const [auth, pushRegistration, pushHook, logoutRoute] = await Promise.all([
    readMobile("src/providers/AuthProvider.tsx"),
    readMobile("src/lib/pushRegistration.ts"),
    readMobile("src/hooks/usePushNotifications.ts"),
    readBackend("app/api/mobile/auth/logout/route.ts"),
  ]);

  assert.match(auth, /cancelPendingPushRegistrations\(\)/);
  assert.match(auth, /revokeRememberedExpoPushToken\(\)/);
  assert.ok(auth.indexOf("cancelPendingPushRegistrations()") < auth.indexOf("revokeRememberedExpoPushToken()"),
    "logout begins push revocation before cancelling an in-flight registration");
  assert.match(auth, /jsonBody\(pushToken \? \{ pushToken \} : \{\}\)/);
  assert.match(pushRegistration, /registrationGeneration \+= 1/);
  assert.match(pushRegistration, /for \(const controller of registrationControllers\) controller\.abort\(\)/);
  assert.match(pushRegistration, /active:\s*\(\) => generation === registrationGeneration && !controller\.signal\.aborted/);
  assert.match(pushRegistration, /if \(!active\(\)\) return false/);
  assert.match(pushRegistration, /if \(active\(\)\) return true;[\s\S]{0,100}forgetRememberedExpoPushToken\(token\)/,
    "a registration cancelled during secure storage persistence can restore a revoked token");
  assert.match(pushHook, /const registration = startPushRegistration\(\)/);
  assert.match(pushHook, /rememberExpoPushToken\(token, registration\.active\)/);
  assert.match(pushHook, /signal:\s*registration\.signal/);
  assert.match(pushHook, /return registration\.cancel/,
    "push registration is not cancelled when its account effect is cleaned up");
  assert.match(pushRegistration, /method:\s*["']DELETE["']/);
  assert.match(pushRegistration, /Notifications\.unregisterForNotificationsAsync\(\)/,
    "local OS push registration remains active after logout");
  assert.match(pushRegistration, /SecureStore\.deleteItemAsync\(PUSH_TOKEN_KEY\)/,
    "the revoked push token remains associated with the next local session");
  const revokeSource = pushRegistration.slice(pushRegistration.indexOf("export async function revokeRememberedExpoPushToken"));
  assert.ok(
    revokeSource.indexOf('method: "DELETE"') < revokeSource.indexOf("Notifications.unregisterForNotificationsAsync()")
      && revokeSource.indexOf("Notifications.unregisterForNotificationsAsync()") < revokeSource.indexOf("SecureStore.deleteItemAsync(PUSH_TOKEN_KEY)"),
    "push cleanup must attempt server revocation before unregistering and forgetting the local token",
  );
  assert.match(logoutRoute, /getSessionUser\(request\)/);
  assert.match(logoutRoute, /eq\(pushDevices\.token, pushToken\)/);
  assert.match(logoutRoute, /status:\s*["']revoked["']/);
  assert.ok(logoutRoute.indexOf("pushDevices.token") < logoutRoute.indexOf("revokeSession(request)"), "push ownership is cleared after the Bearer session has already been revoked");
});
