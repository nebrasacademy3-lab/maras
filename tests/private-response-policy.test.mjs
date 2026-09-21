import assert from "node:assert/strict";
import test from "node:test";
import { assertPrivateNoStore } from "../scripts/qa-private-response-policy.mjs";
test("accepts private no-store with optional zero age and case/order differences", () => {
  for (const value of ["private, no-store", "private, no-store, max-age=0", 'No-Store, MAX-AGE="0", private', "private, no-store, s-maxage=0, must-revalidate"]) assert.doesNotThrow(() => assertPrivateNoStore(value));
});
test("rejects missing, public, partial-private and cacheable responses", () => {
  for (const value of [undefined, "", "no-cache", "private", "no-store", "private, no-store, public", 'private="authorization", no-store', "private, no-store, max-age=60", "private, no-store, s-maxage=30", "private, no-store, max-age=invalid"]) assert.throws(() => assertPrivateNoStore(value));
});
