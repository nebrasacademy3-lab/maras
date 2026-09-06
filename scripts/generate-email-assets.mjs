// Rasterize the project's existing Font Awesome brand glyphs for email clients.
// Development-only: no external requests, no new icon/font dependency.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const vendor = path.resolve("mobile/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons");
const glyphs = JSON.parse(fs.readFileSync(path.join(vendor, "glyphmaps/FontAwesome6Free.json"), "utf8"));
const font = fs.readFileSync(path.join(vendor, "Fonts/FontAwesome6_Brands.ttf"));
const names = { whatsapp: "whatsapp", x: "x-twitter", instagram: "instagram", tiktok: "tiktok", youtube: "youtube", telegram: "telegram", linkedin: "linkedin-in", facebook: "facebook-f", snapchat: "snapchat", threads: "threads" };
const directory = path.resolve("public/email-assets");
fs.mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.MARAS_TEST_BROWSER ? { channel: process.env.MARAS_TEST_BROWSER } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 96, height: 96 }, deviceScaleFactor: 1 });
  await page.route("**/*", route => route.request().url() === "https://email-assets.invalid/brands.ttf" ? route.fulfill({ contentType: "font/ttf", body: font }) : route.abort());
  for (const [id, name] of Object.entries(names)) {
    if (!Number.isInteger(glyphs[name])) throw new Error("Missing project icon: " + name);
    await page.setContent(`<style>@font-face{font-family:MailBrands;src:url('https://email-assets.invalid/brands.ttf')}body{margin:0;width:96px;height:96px;background:#fff;color:#1258e8}div{width:96px;height:96px;display:grid;place-items:center;font:54px MailBrands;line-height:1}</style><div>${String.fromCodePoint(glyphs[name])}</div>`);
    await page.evaluate(() => document.fonts.ready);
    if (!await page.evaluate(() => document.fonts.check("54px MailBrands"))) throw new Error("Brand font failed to load");
    await page.screenshot({ path: path.join(directory, id + ".png") });
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ icons: Object.keys(names).length, directory }));
