import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  catalogFilterContext,
  customizeCatalogFilters,
  resolveCatalogFilterState,
} from "../src/lib/catalogFilterState.ts";

const ALL_U = "__all_universities__";
const ALL_S = "__all_specialties__";

test("catalog defaults restore per identity and never leak the previous account filters", () => {
  const guest = catalogFilterContext(false, null, ALL_U, ALL_S);
  const userA = catalogFilterContext(false, { id: 1, universitySlug: "جامعة-أ", specialty: "طب" }, ALL_U, ALL_S);
  const restoredA = resolveCatalogFilterState(guest, userA);
  assert.deepEqual(restoredA, userA);

  const customizedA = customizeCatalogFilters(restoredA, { scope: "all", university: "جامعة-خاصة", specialty: "هندسة" });
  const userB = catalogFilterContext(false, { id: 2, universitySlug: "جامعة-ب", specialty: "حاسب" }, ALL_U, ALL_S);
  assert.deepEqual(resolveCatalogFilterState(customizedA, userB), userB);
});

test("same-id profile refresh updates untouched defaults but preserves customized filters", () => {
  const before = catalogFilterContext(false, { id: 7, universitySlug: "جامعة-قديمة", specialty: "قانون" }, ALL_U, ALL_S);
  const after = catalogFilterContext(false, { id: 7, universitySlug: "جامعة-جديدة", specialty: "إدارة" }, ALL_U, ALL_S);
  assert.deepEqual(resolveCatalogFilterState(before, after), after);

  const customized = customizeCatalogFilters(before, { scope: "all", university: ALL_U, specialty: "لغة عربية" });
  assert.deepEqual(resolveCatalogFilterState(customized, after), customized);
});

test("identity-derived filters are independent from the assistant search query", async () => {
  const text = await readFile(new URL("../app/(tabs)/courses.tsx", import.meta.url), "utf8");
  assert.match(text, /useLocalSearchParams/);
  assert.match(text, /sanitizeAssistantCourseQuery/);
  assert.match(text, /resolveCatalogFilterState\(storedFilters, filterContext\)/);
  assert.doesNotMatch(text, /resolveCatalogFilterState\([^)]*\)[^;]*setQuery/s);
});
