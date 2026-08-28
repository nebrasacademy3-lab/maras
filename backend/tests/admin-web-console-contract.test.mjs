import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { INTERNAL_ACTION_OPTIONS } from "../lib/internal-action-route.ts";

const root = new URL("..", import.meta.url);
const admin = await readFile(new URL("components/admin-dashboard.tsx", root), "utf8");
const mobileActionOptions = await readFile(new URL("../mobile/src/lib/admin-action-routes.ts", root), "utf8");

test("web admin does not replay public R2 proxy paths as writable media URLs", () => {
  assert.match(admin, /logoUrl:\s*row\.logo\?\.startsWith\(["']https:\/\/["']\)\s*\?\s*row\.logo\s*:\s*["']["']/);
  assert.match(admin, /coverImage\?\.startsWith\(["']https:\/\/["']\)\?dialog\.item\.coverImage:["']["']/);
  assert.doesNotMatch(admin, /logoUrl:\s*row\.logo\s*\|\|\s*["']["']/);
  assert.doesNotMatch(admin, /defaultValue=\{dialog\.item\?\.coverImage\|\|["']["']\}/);
});

test("web admin exposes only state transitions accepted by the server contract", () => {
  assert.match(admin, /deleted=row\.status===["']deleted["']/);
  assert.match(admin, /disabled=\{deleted\}/);
  assert.match(admin, /role===["']student["']&&row\.status===["']active["']/);
  assert.match(admin, /course\.status===["']published["']/);
  assert.match(admin, /value=["']available["'] disabled=\{!selected\}/);
  assert.match(admin, /row\.role===["']supervisor["']&&row\.status===["']active["']/);
  assert.match(admin, /data\.specialtyLinks\.some/);
});

test("web admin uses explicit individual notification and existing-account contracts", () => {
  assert.match(admin, /<option value=["']user["']>مستخدم محدد بالبريد<\/option>/);
  assert.match(admin, /userEmail:audience===["']user["']\?form\.get\(["']userEmail["']\):null/);
  assert.match(admin, /required=\{audience===["']user["']\}/);
  assert.match(admin, /allowExisting:form\.get\(["']allowExisting["']\)===["']on["']/);
  assert.match(admin, /confirmation:form\.get\(["']allowExisting["']\)===["']on["']\?["']تحديث حساب موظف["']:undefined/);
  assert.match(admin, /تم تحويل الحساب الموجود إلى حساب موظف بعد التأكيد الصريح/);
});

test("Expo admin action picker stays identical to the canonical server allowlist", () => {
  const nativeKeys = [...mobileActionOptions.matchAll(/\{ key: ["']([^"']+)["'], label:/g)].map((match) => match[1]);
  assert.deepEqual(nativeKeys, INTERNAL_ACTION_OPTIONS.map((option) => option.value));
});
