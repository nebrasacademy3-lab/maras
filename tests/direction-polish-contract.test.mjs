import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("web layout applies global RTL while preserving natural LTR fields", async () => {
  const [layout, css, additions, assistant] = await Promise.all([
    read("app/layout.tsx"),
    read("app/direction-polish.css"),
    read("app/additions.css"),
    read("components/meras-assistant.tsx"),
  ]);
  assert.match(layout, /<html lang="ar" dir="rtl"/);
  assert.match(layout, /direction-polish\.css/);
  assert.match(css, /html\[dir="rtl"\] body[^}]*direction:\s*rtl/s);
  assert.match(css, /input\[type="email"\]/);
  assert.match(css, /input\[dir="auto"\]/);
  assert.match(css, /\.university-card\s*>\s*p/);
  assert.match(css, /\.university-identity\s*>\s*div:last-child\s*>\s*p/);
  assert.match(css, /unicode-bidi:\s*plaintext/);
  assert.match(assistant, /<div dir="auto"><p>\{message\.text\}<\/p>/);
  assert.match(additions, /\.assistant-message\.user\s*>\s*div\s*>\s*p[^}]*direction:\s*inherit[^}]*text-align:\s*start/s);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
