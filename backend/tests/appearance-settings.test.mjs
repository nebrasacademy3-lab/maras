import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("web appearance preferences provide palettes, font scale, and early hydration", async () => {
  const [provider, layout, css, student, admin, supervisor] = await Promise.all([
    read("components/theme-provider.tsx"),
    read("app/layout.tsx"),
    read("app/additions.css"),
    read("components/student-dashboard.tsx"),
    read("components/admin-dashboard.tsx"),
    read("components/supervisor-dashboard.tsx"),
  ]);
  assert.match(provider, /official.*violet.*rose.*teal/s);
  assert.match(provider, /fontScale/);
  assert.match(provider, /localStorage\.setItem\("meras-palette"/);
  assert.match(provider, /localStorage\.setItem\("meras-font-scale"/);
  assert.match(layout, /meras-palette/);
  assert.match(layout, /meras-font-scale/);
  assert.match(css, /data-palette="rose"/);
  assert.match(css, /data-font-scale="1\.2"/);
  assert.match(student, /<AppearanceSettings\s*\/>/);
  assert.match(admin, /<AppearanceSettings\s*\/>/);
  assert.match(supervisor, /<AppearanceSettings\s*\/>/);
});

test("Expo appearance preferences are persisted and mounted for all roles", async () => {
  const [colors, provider, settings, screen, account, admin, supervisor, brand] = await Promise.all([
    read(new URL("../mobile/src/theme/colors.ts", root)),
    read(new URL("../mobile/src/providers/ThemeProvider.tsx", root)),
    read(new URL("../mobile/src/components/AppearanceSettings.tsx", root)),
    read(new URL("../mobile/src/components/ui.tsx", root)),
    read(new URL("../mobile/app/(tabs)/account.tsx", root)),
    read(new URL("../mobile/app/admin.tsx", root)),
    read(new URL("../mobile/app/supervisor.tsx", root)),
    read(new URL("../mobile/src/components/Brand.tsx", root)),
  ]);
  assert.match(colors, /PaletteId/);
  assert.match(colors, /rose/);
  assert.match(provider, /meras_palette/);
  assert.match(provider, /meras_font_scale/);
  assert.match(settings, /setPalette/);
  assert.match(settings, /setFontScale/);
  assert.match(screen, /ScaledText as Text/);
  assert.doesNotMatch(screen, /scaleStyle|scale:\s*fontScale/);
  assert.match(account, /<AppearanceSettings\s*\/>/);
  assert.match(admin, /<AppearanceSettings\s*\/>/);
  assert.match(supervisor, /<AppearanceSettings\s*\/>/);
  assert.match(brand, /assets\/brand-mark-square/);
  assert.match(brand, /assets\/brand-logo-(?:dark|light)\.png/);
  assert.doesNotMatch(brand, /tintColor/);
});
