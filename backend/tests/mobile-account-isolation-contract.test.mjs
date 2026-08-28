import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const mobileRoot = new URL("../../mobile/", import.meta.url);
const readMobile = (relative) => readFile(new URL(relative, mobileRoot), "utf8");

async function importMobileTypescript(relative) {
  const source = await readMobile(relative);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const [profileHydration, catalogFilters, atomicPersistence] = await Promise.all([
  importMobileTypescript("src/lib/profileFormHydration.ts"),
  importMobileTypescript("src/lib/catalogFilterState.ts"),
  importMobileTypescript("src/lib/atomicPersistence.ts"),
]);

test("Expo removes every user-scoped query and mutation when account identity changes", async () => {
  const sync = await readMobile("src/providers/RealtimeSyncProvider.tsx");
  const rootsBlock = sync.match(/const USER_SCOPED_QUERY_ROOTS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
  const scopedRoots = [
    "admin-console",
    "announcements",
    "cart",
    "dashboard",
    "favorites",
    "notifications",
    "support",
    "supervisor-requests",
    "supervisor-workspace",
  ];
  for (const root of scopedRoots) {
    assert.match(rootsBlock, new RegExp(`["']${root}["']`), `${root} is not cleared when the authenticated account changes`);
  }

  const identityAt = sync.indexOf("const identity = user ? `user:${user.id}` : \"guest\"");
  const compareAt = sync.indexOf("lastIdentity === identity");
  const removeAt = sync.indexOf("queryClient.removeQueries");
  const mutationsAt = sync.indexOf("queryClient.getMutationCache().clear()");
  assert.ok(identityAt >= 0 && compareAt > identityAt && removeAt > compareAt && mutationsAt > removeAt,
    "account-switch cleanup does not run after comparing the authenticated identity");
  assert.match(sync, /USER_SCOPED_QUERY_ROOTS\.has\(root\)/,
    "account-switch cleanup does not use the complete scoped-query allowlist");
  assert.match(sync, /previous\.current = null/,
    "sync channel state leaks across authenticated identities");
});

test("sensitive Expo query keys include the authenticated user identity", async () => {
  const owners = {
    "app/admin.tsx": ["admin-console"],
    "app/cart.tsx": ["cart"],
    "app/(tabs)/index.tsx": ["dashboard"],
    "app/(tabs)/learning.tsx": ["dashboard"],
    "app/orders.tsx": ["dashboard"],
    "app/requests.tsx": ["dashboard"],
    "app/notifications.tsx": ["notifications"],
    "app/favorites.tsx": ["favorites"],
    "app/support.tsx": ["support"],
    "app/supervisor.tsx": ["supervisor-workspace", "supervisor-requests"],
    "src/components/AnnouncementCampaign.tsx": ["announcements"],
  };

  for (const [relative, roots] of Object.entries(owners)) {
    const source = await readMobile(relative);
    for (const root of roots) {
      if (root === "announcements") {
        assert.match(source, /queryKey:\s*\["announcements",\s*user\?\.id \?\? "guest"\]/,
          `${relative} shares guest/account announcement cache entries`);
      } else {
        assert.match(source, new RegExp(`queryKey:\\s*\\["${root}",\\s*user\\?\\.id\\]`),
          `${relative} has an unscoped ${root} query key`);
      }
    }
  }
});

test("protected Expo screens wait for cold-start auth restoration and expose offline retry", async () => {
  const screens = {
    "app/profile.tsx": "if (loading)",
    "app/complete-profile.tsx": "if (loading)",
    "app/cart.tsx": "if (authLoading)",
    "app/requests.tsx": "if (authLoading)",
    "app/support.tsx": "if (authLoading)",
    "app/security.tsx": "if (authLoading)",
    "app/admin.tsx": "if (authLoading)",
    "app/supervisor.tsx": "if (authLoading)",
  };

  for (const [relative, loadingGuard] of Object.entries(screens)) {
    const source = await readMobile(relative);
    const loadingAt = source.indexOf(loadingGuard);
    const offlineAt = source.indexOf("if (!user && offline && token)");
    const guestAt = source.indexOf("if (!user)", offlineAt + 1);
    assert.ok(loadingAt >= 0 && offlineAt > loadingAt && guestAt > offlineAt,
      `${relative} redirects/renders as guest before auth restoration and offline recovery finish`);
    assert.match(source.slice(offlineAt, guestAt), /ErrorState[\s\S]*onRetry=\{\(\) => void refresh(?:Auth)?\(\)\}/,
      `${relative} does not let an offline cached session retry verification`);
  }

  const index = await readMobile("app/index.tsx");
  assert.match(index, /loading \|\| controls\.loading[\s\S]*\(offline && token && !user\)/,
    "the launch router can redirect a cached offline account to the guest flow");
  assert.match(index, /!loading && offline && token && !user[\s\S]*ErrorState[\s\S]*onRetry=/,
    "the launch screen has no retry state for a cached session that cannot yet be verified");
});

test("remaining protected Expo screens share a cold-start gate before guest UI and account queries", async () => {
  const helper = await readMobile("src/components/AuthRestoreState.tsx");
  assert.match(helper, /pendingOfflineSession = !auth\.user && auth\.offline && Boolean\(auth\.token\)/);
  assert.match(helper, /authReady = !auth\.loading && !pendingOfflineSession/);
  assert.match(helper, /auth\.loading[\s\S]*pendingOfflineSession[\s\S]*ErrorState[\s\S]*auth\.refresh\(\)/,
    "shared cold-start gate does not separate loading and offline cached-session recovery");

  const screens = [
    "app/(tabs)/account.tsx",
    "app/(tabs)/learning.tsx",
    "app/favorites.tsx",
    "app/notifications.tsx",
    "app/orders.tsx",
    "app/learn/[slug].tsx",
    "app/onboarding.tsx",
  ];
  for (const relative of screens) {
    const source = await readMobile(relative);
    assert.match(source, /useAuthRestoreState\(/, `${relative} bypasses the shared auth restoration gate`);
    const gateAt = source.indexOf("if (restoration) return restoration");
    const guestOffset = source.slice(Math.max(0, gateAt + 1)).search(/if \(!user(?:\)|\s*&&)/);
    const guestAt = guestOffset < 0 ? -1 : gateAt + 1 + guestOffset;
    assert.ok(gateAt >= 0 && guestAt > gateAt, `${relative} renders guest UI before restoration settles`);
    if (/queryKey:\s*\[["'](?:dashboard|favorites|notifications)["']/.test(source)) {
      assert.match(source, /enabled:\s*authReady && Boolean\(user\)/,
        `${relative} starts an account query before auth restoration settles`);
    }
  }
  const onboarding = await readMobile("app/onboarding.tsx");
  assert.match(onboarding, /if \(authReady && controls\.ready/,
    "onboarding can redirect a pending offline session into the guest flow");
  assert.match(onboarding, /if \(!authReady \|\| controls\.loading\) return/,
    "onboarding completion can run before authentication is restored");
});

test("profile forms merge refreshed server data without overwriting dirty fields", async () => {
  const server = { fullName: "الاسم الجديد", phone: "0500000002", universitySlug: "ksu", specialty: "الطب" };
  const edits = profileHydration.updateDirtyForm({}, { phone: "0500000099" });
  assert.deepEqual(profileHydration.mergeServerFormWithEdits(server, edits), {
    ...server,
    phone: "0500000099",
  });

  for (const relative of ["app/profile.tsx", "app/complete-profile.tsx"]) {
    const source = await readMobile(relative);
    assert.match(source, /Form key=\{user\.id\} initialUser=\{user\}/,
      `${relative} does not remount its form when the authenticated identity changes`);
    assert.match(source, /serverForm[\s\S]{0,360}initialUser\.fullName[\s\S]{0,360}initialUser\.universitySlug/,
      `${relative} does not derive fresh values from the latest restored account`);
    assert.match(source, /mergeServerFormWithEdits\(serverForm, edits\)/,
      `${relative} does not merge same-account server refreshes with unsaved edits`);
    assert.match(source, /setEdits\(\(current\) => updateDirtyForm\(current/,
      `${relative} does not track locally edited fields separately from server state`);
    assert.doesNotMatch(source, /useEffect\(\(\) => \{[\s\S]{0,240}setForm\(/,
      `${relative} can overwrite unsaved edits during an auth/profile refresh`);
  }
});

test("catalog filters reset for another identity and preserve only deliberate same-user choices", async () => {
  const allUniversities = "__all_universities__";
  const allSpecialties = "__all_specialties__";
  const restoring = catalogFilters.catalogFilterContext(true, null, allUniversities, allSpecialties);
  const firstUser = catalogFilters.catalogFilterContext(false, { id: 7, universitySlug: "ksu", specialty: "الطب" }, allUniversities, allSpecialties);
  assert.deepEqual(catalogFilters.resolveCatalogFilterState(restoring, firstUser), firstUser,
    "cold-start filters did not hydrate from the restored user");

  const customized = catalogFilters.customizeCatalogFilters(firstUser, { scope: "all", university: allUniversities, specialty: allSpecialties });
  const refreshedSameUser = catalogFilters.catalogFilterContext(false, { id: 7, universitySlug: "seu", specialty: "القانون" }, allUniversities, allSpecialties);
  assert.deepEqual(catalogFilters.resolveCatalogFilterState(customized, refreshedSameUser), customized,
    "same-user server refresh overwrote deliberate filter choices");

  const anotherUser = catalogFilters.catalogFilterContext(false, { id: 8, universitySlug: "seu", specialty: "القانون" }, allUniversities, allSpecialties);
  assert.deepEqual(catalogFilters.resolveCatalogFilterState(customized, anotherUser), anotherUser,
    "catalog filters leaked from one account into another");

  const courses = await readMobile("app/(tabs)/courses.tsx");
  assert.match(courses, /sanitizeAssistantCourseQuery\(params\.q\)/,
    "identity filter synchronization dropped assistant search normalization");
  assert.match(courses, /const filters = resolveCatalogFilterState\(storedFilters, filterContext\)/,
    "catalog filters do not derive immediately from auth/profile context changes");
  assert.match(courses, /const filterContext = useMemo\([\s\S]{0,220}catalogFilterContext\(authLoading, user/,
    "catalog filter context is not recomputed for restored or switched accounts");
});

test("auth token persistence commits global Bearer state atomically", async () => {
  let value = "old-token";
  await assert.rejects(
    atomicPersistence.persistThenCommit(
      async () => { throw new Error("secure storage unavailable"); },
      () => { value = "new-token"; },
      () => { value = "old-token"; },
    ),
    /secure storage unavailable/,
  );
  assert.equal(value, "old-token");

  await atomicPersistence.persistThenCommit(
    async () => undefined,
    () => { value = "new-token"; },
    () => { value = "old-token"; },
  );
  assert.equal(value, "new-token");

  const auth = await readMobile("src/providers/AuthProvider.tsx");
  const persistenceAt = auth.indexOf("persistThenCommit(");
  const secureStoreAt = auth.indexOf("SecureStore.setItemAsync(TOKEN_KEY", persistenceAt);
  const commitAt = auth.indexOf("() => setApiToken(value)", persistenceAt);
  const rollbackAt = auth.indexOf("() => setApiToken(previous)", persistenceAt);
  assert.ok(persistenceAt >= 0 && secureStoreAt > persistenceAt && commitAt > secureStoreAt && rollbackAt > commitAt,
    "AuthProvider can expose a Bearer token before durable persistence succeeds");
});
