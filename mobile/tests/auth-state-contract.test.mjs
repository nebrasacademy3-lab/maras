import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { persistThenCommit } from "../src/lib/atomicPersistence.ts";
import { mergeServerFormWithEdits, updateDirtyForm } from "../src/lib/profileFormHydration.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("same-id server refresh hydrates untouched profile fields without overwriting edits", () => {
  const first = { fullName: "الاسم القديم", phone: "0500000000", universitySlug: "u1", specialty: "طب" };
  const edits = updateDirtyForm({}, { phone: "0555555555" });
  const refreshedSameUser = { ...first, fullName: "الاسم الموثق", universitySlug: "u2", specialty: "هندسة" };

  assert.deepEqual(mergeServerFormWithEdits(refreshedSameUser, edits), {
    fullName: "الاسم الموثق",
    phone: "0555555555",
    universitySlug: "u2",
    specialty: "هندسة",
  });

  const linkedEdits = updateDirtyForm(edits, { universitySlug: "u3", specialty: "حاسب" });
  assert.deepEqual(mergeServerFormWithEdits(refreshedSameUser, linkedEdits), {
    fullName: "الاسم الموثق",
    phone: "0555555555",
    universitySlug: "u3",
    specialty: "حاسب",
  });
});

test("Bearer state commits only after durable token persistence", async () => {
  const failedEvents = [];
  await assert.rejects(() => persistThenCommit(
    async () => { failedEvents.push("persist"); throw new Error("secure store unavailable"); },
    () => failedEvents.push("commit"),
    () => failedEvents.push("rollback"),
  ));
  assert.deepEqual(failedEvents, ["persist", "rollback"]);

  const successEvents = [];
  await persistThenCommit(
    async () => { successEvents.push("persist"); },
    () => successEvents.push("commit"),
    () => successEvents.push("rollback"),
  );
  assert.deepEqual(successEvents, ["persist", "commit"]);
});

test("all cold-start account screens share loading and offline restoration UX", async () => {
  const protectedScreens = [
    "app/(tabs)/account.tsx",
    "app/(tabs)/learning.tsx",
    "app/favorites.tsx",
    "app/notifications.tsx",
    "app/orders.tsx",
    "app/learn/[slug].tsx",
    "app/onboarding.tsx",
  ];
  for (const path of protectedScreens) {
    const text = await source(path);
    assert.match(text, /useAuthRestoreState/, `${path} must use the shared restore state`);
    assert.match(text, /if \(restoration\) return restoration/, `${path} must render restore state before guest UX`);
  }
});

