import assert from "node:assert/strict";
/** Check cache semantics without weakening private/no-store for extra safe directives. */
export function assertPrivateNoStore(value) {
  assert.ok(typeof value === "string", "Private response must specify Cache-Control");
  const directives = value.toLowerCase().split(",").map(part => part.trim());
  assert.ok(directives.includes("private") && directives.includes("no-store"), "Private response must prohibit caching of the entire representation");
  assert.ok(!directives.some(part => /^public(?:\s|=|$)/.test(part)), "Private response must not be public");
  assert.ok(directives.filter(part => /^(?:max-age|s-maxage)\s*=/.test(part)).every(part => /^(?:max-age|s-maxage)\s*=\s*(?:0|"0")$/.test(part)), "Private response must not advertise a positive cache lifetime");
}
