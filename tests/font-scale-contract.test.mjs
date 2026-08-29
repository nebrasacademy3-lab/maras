import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(join(here, "..", relative), "utf8");
const webCss = await read("app/additions.css");
const globalCss = await read("app/globals.css");
const webTheme = await read("components/theme-provider.tsx");
const mobileTheme = await read("mobile/src/providers/ThemeProvider.tsx");
const scaledText = await read("mobile/src/components/ScaledText.tsx");
const scaledTextInput = await read("mobile/src/components/ScaledTextInput.tsx");
const mobileUi = await read("mobile/src/components/ui.tsx");
const mobileSources = await Promise.all((await readFile(join(here, "../mobile/app/assistant.tsx"), "utf8")).split("\n").slice(0, 8));

test("web font scale is text-only and never zooms the page", () => {
  assert.match(webCss, /--font-scale/);
  assert.match(webCss, /font-size: calc\(/);
  assert.doesNotMatch(webCss, /zoom\s*:/);
  assert.doesNotMatch(webCss, /data-font-scale=[^\n]*body/);
  assert.match(webTheme, /dataset\.fontScale/);
  assert.match(globalCss, /font-family/);
});

test("mobile font scale is applied through text style only", () => {
  assert.match(mobileTheme, /fontScale/);
  assert.match(scaledText, /fontSize: baseFontSize \* fontScale/);
  assert.match(scaledText, /lineHeight: flattened\.lineHeight \* fontScale/);
  assert.doesNotMatch(scaledText, /transform/);
  assert.match(scaledTextInput, /fontSize: baseFontSize \* fontScale/);
  assert.match(scaledTextInput, /lineHeight: flattened\.lineHeight \* fontScale/);
  assert.doesNotMatch(scaledTextInput, /transform/);
  assert.doesNotMatch(mobileUi, /scaleStyle|scale:\s*fontScale/);
  assert.match(mobileUi, /ScaledText as Text/);
  assert.match(mobileSources.join("\n"), /ScaledText as Text/);
});
