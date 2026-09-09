import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../lib/auth-input.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { normalizeVerificationCode, passwordRequirements } = await import("data:text/javascript;base64," + Buffer.from(javascript).toString("base64"));
test("OTP accepts Latin, Arabic and Persian keyboards and pasted separators without losing leading zero", () => {
  for (const value of ["012345", "٠١٢٣٤٥", "۰۱۲۳۴۵", " ٠١٢ ٣٤٥\n", "0-1-2-3-4-5"]) assert.equal(normalizeVerificationCode(value), "012345");
  assert.equal(normalizeVerificationCode("٠١٢٣٤٥٦"), "012345");
  assert.equal(normalizeVerificationCode("abcdef"), "");
});
test("visible password requirements match server length, number and symbol policy", () => {
  for (const [password, allowed] of [["Example!123", true], ["مرحبامراس1!", true], ["short1!", false], ["NoNumbers!!", false], ["NoSymbols123", false], ["x".repeat(129) + "1!", false]]) assert.equal(passwordRequirements(password).every(item => item.met), allowed, password);
});
