import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  dashboardReturnPath,
  normalizeDashboardView,
  safeInternalReturnPath,
} from "../lib/internal-return-route.ts";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("web post-auth redirects preserve internal queries and reject browser-normalized external forms", () => {
  assert.equal(safeInternalReturnPath("/support?ticketId=1"), "/support?ticketId=1");
  assert.equal(safeInternalReturnPath("//evil.example"), "");
  assert.equal(safeInternalReturnPath("/\\evil.example"), "");
  assert.equal(safeInternalReturnPath("https://evil.example/support"), "");
  assert.equal(safeInternalReturnPath("/support\u0000?ticketId=1"), "");
  assert.equal(safeInternalReturnPath("\u0007/support"), "");
  assert.equal(safeInternalReturnPath(["/support"]), "");
  assert.equal(safeInternalReturnPath("//evil.example", "/dashboard"), "/dashboard");
});

test("dashboard return paths preserve only canonical student views", () => {
  for (const view of ["overview", "learning", "requests", "orders", "notifications", "support", "account"]) {
    assert.equal(normalizeDashboardView(view), view);
    assert.equal(
      dashboardReturnPath(view),
      view === "overview" ? "/dashboard" : `/dashboard?view=${view}`,
    );
  }
  for (const value of ["courses", "admin", "../orders", ["orders"], null, undefined]) {
    assert.equal(normalizeDashboardView(value), "overview");
    assert.equal(dashboardReturnPath(value), "/dashboard");
  }
});

test("login, registration, profile completion, and onboarding use the same web return-path sanitizer", async () => {
  const [authShell, completeProfile, onboarding] = await Promise.all([
    read("components/auth-shell.tsx"),
    read("components/complete-profile-form.tsx"),
    read("components/onboarding-tour.tsx"),
  ]);
  for (const [surface, source] of [["auth shell", authShell], ["complete profile", completeProfile], ["onboarding", onboarding]]) {
    assert.match(source, /safeInternalReturnPath/, `${surface} bypasses the shared return-path sanitizer`);
    assert.doesNotMatch(source, /window\.location\.(?:assign|replace)\([^)]*searchParams\.get\(["']return_to["']\)/,
      `${surface} redirects directly to an untrusted return_to value`);
  }
  assert.match(completeProfile, /safeInternalReturnPath\(new URLSearchParams\(window\.location\.search\)\.get\(["']return_to["']\)\)/,
    "profile completion does not sanitize its query-string return target");
  assert.match(completeProfile, /queryTarget \|\| sessionStorage\.getItem\(["']meras_return_to["']\)/,
    "profile completion drops the return target saved by the login/profile gate");
  assert.match(completeProfile, /window\.location\.assign\(safeInternalReturnPath\(storedTarget, next\)\)/,
    "profile completion does not revalidate the stored return target immediately before navigation");

  const responseGuardAt = completeProfile.indexOf("if (!response.ok)");
  const storeAt = completeProfile.indexOf('sessionStorage.setItem("meras_return_to", queryTarget)');
  const nextAt = completeProfile.indexOf("const next = safeInternalReturnPath");
  const onboardingBranchAt = completeProfile.indexOf('if (next === "/onboarding")');
  assert.ok(responseGuardAt >= 0 && storeAt > responseGuardAt,
    "profile completion stores return_to before confirming the profile save succeeded");
  assert.ok(nextAt > storeAt && onboardingBranchAt > storeAt,
    "profile completion must persist return_to before following the onboarding branch");

  const queryAt = onboarding.indexOf("const queryTarget = safeInternalReturnPath");
  const storedAt = onboarding.indexOf("const storedTarget = safeInternalReturnPath");
  const priorityAt = onboarding.indexOf("return queryTarget || storedTarget");
  assert.ok(queryAt >= 0 && storedAt > queryAt && priorityAt > storedAt,
    "onboarding must prefer a freshly supplied sanitized query target to saved session state");
  assert.match(onboarding, /window\.location\.replace\(returnTarget\(\) \|\| ["']\/dashboard["']\)/,
    "the disabled-onboarding path drops the sanitized return target");
  assert.match(onboarding, /const storedTarget = returnTarget\(\) \|\| payload\.next \|\| ["']\/dashboard["']/,
    "finishing onboarding drops the sanitized return target");
});

test("dashboard authentication and student navigation retain the requested canonical view", async () => {
  const [dashboard, studentDashboard] = await Promise.all([
    read("app/dashboard/page.tsx"),
    read("components/student-dashboard.tsx"),
  ]);

  const awaitParamsAt = dashboard.indexOf("(await searchParams).view");
  const normalizeAt = dashboard.indexOf("normalizeDashboardView(requestedView)");
  const returnAt = dashboard.indexOf("dashboardReturnPath(view)");
  const requireAt = dashboard.indexOf("requireUser(returnTo)");
  const onboardingAt = dashboard.indexOf("encodeURIComponent(returnTo)");
  assert.ok(awaitParamsAt >= 0 && normalizeAt > awaitParamsAt && returnAt > normalizeAt && requireAt > returnAt,
    "dashboard must normalize and preserve its requested view before the authentication gate");
  assert.ok(onboardingAt > requireAt,
    "dashboard onboarding redirect does not preserve the authenticated return path");
  assert.match(dashboard, /<StudentDashboard initialView=\{view\}/,
    "dashboard does not pass the normalized view to student navigation");

  assert.match(studentDashboard, /\{ id:\s*["']learning["'], label:/,
    "student navigation is missing the canonical learning view");
  assert.match(studentDashboard, /active === ["']learning["']/,
    "student learning content does not use the canonical learning view");
  assert.doesNotMatch(studentDashboard, /\{ id:\s*["']courses["'], label:/,
    "student navigation still exposes the obsolete courses view id");
});
