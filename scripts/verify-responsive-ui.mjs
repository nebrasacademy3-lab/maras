/* Local, read-only browser QA. Requires Playwright in NODE_PATH. */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { homepageContentSignature, assertHomepageContentParity, assertHomepageCardsReadable, assertHomepageRailsReachable } from "./home-responsive-checks.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");

const widths = [320, 360, 390, 768, 1024, 1440];
const themes = ["light", "dark"];
const intents = [
  { id: "course", label: "أبحث عن مادة" },
  { id: "slides", label: "لدي سلايدات", href: "/study-tools" },
  { id: "summary", label: "لخّص لي", href: "/study-tools?service=summary" },
  { id: "quiz", label: "اختبرني", href: "/study-tools?service=quiz" },
];
const officialPalette = {
  light: { primary: "#1258e8", secondary: "#7445f5" },
  dark: { primary: "#4d82ff", secondary: "#9a6dff" },
};

async function assertNoOverflow(page, label) {
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    offenders: Array.from(document.querySelectorAll("main, section, header, footer, form, [role=tablist], [role=listbox]")).flatMap(element => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (!box.width || style.visibility === "hidden") return [];
      return box.left < -2 || box.right > innerWidth + 2 ? [{ tag: element.tagName, className: String(element.className).slice(0, 100), left: Math.round(box.left), right: Math.round(box.right) }] : [];
    }).slice(0, 8),
  }));
  assert.ok(geometry.document <= geometry.viewport + 1 && geometry.body <= geometry.viewport + 1, label + " overflows: " + JSON.stringify(geometry));
}

async function assertReducedMotion(page) {
  const violations = await page.evaluate(() => {
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) return ["reduced motion media preference missing"];
    const seconds = value => value.split(",").map(part => part.trim().endsWith("ms") ? parseFloat(part) / 1000 : parseFloat(part));
    return Array.from(document.querySelectorAll("main, main *")).flatMap(element => {
      if (!element.getClientRects().length) return [];
      return [null, "::before", "::after"].flatMap(pseudo => {
        const style = getComputedStyle(element, pseudo);
        if (pseudo && (!style.content || style.content === "none" || style.content === "normal")) return [];
        const animated = style.animationName !== "none" && seconds(style.animationDuration).some(value => value > .02);
        const transitioning = seconds(style.transitionDuration).some(value => value > .02);
        return animated || transitioning ? [{ tag: element.tagName, className: String(element.className).slice(0, 80), pseudo, animation: style.animationName, duration: style.animationDuration, transition: style.transitionDuration }] : [];
      });
    }).slice(0, 15);
  });
  assert.deepEqual(violations, [], "Visible content ignores reduced motion");
}

async function assertOfficialPalette(page, theme) {
  const palette = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const hero = document.querySelector('section[aria-labelledby="home-gateway-title"]');
    const oldRecolor = ["rgb(148, 235, 205)", "rgb(18, 108, 89)", "rgb(8, 31, 43)", "rgb(17, 52, 64)", "rgb(23, 100, 81)"];
    const oldColors = hero ? Array.from(hero.querySelectorAll("*")).concat(hero).flatMap(element => {
      const style = getComputedStyle(element);
      const values = [style.color, style.backgroundColor, style.borderColor, style.backgroundImage];
      const color = oldRecolor.find(value => values.some(computed => computed.includes(value)));
      return color ? [{ tag: element.tagName, color }] : [];
    }).slice(0, 10) : [];
    return {
      primary: root.getPropertyValue("--primary").trim().toLowerCase(),
      secondary: root.getPropertyValue("--primary-2").trim().toLowerCase(),
      selectedPalette: document.documentElement.dataset.palette,
      oldColors,
    };
  });
  assert.equal(palette.primary, officialPalette[theme].primary, "The official blue changed");
  assert.equal(palette.secondary, officialPalette[theme].secondary, "The official violet changed");
  assert.equal(palette.selectedPalette || "official", "official");
  assert.deepEqual(palette.oldColors, [], "The removed mint/navy hero recolor is still rendered");
  return palette;
}

async function assertProminentClaim(page) {
  const gateway = page.locator('section[aria-labelledby="home-gateway-title"]');
  await gateway.waitFor();
  const claim = gateway.getByText(/أول منصة سعودية/).first();
  assert.equal(await claim.isVisible(), true, "The first-platform statement must be visible in the hero");
  const layout = await claim.evaluate(element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const heading = document.getElementById("home-gateway-title").getBoundingClientRect();
    return { top: box.top, height: box.height, width: box.width, headingTop: heading.top, headingBottom: heading.bottom, fontSize: parseFloat(style.fontSize), weight: parseInt(style.fontWeight, 10), opacity: parseFloat(style.opacity) };
  });
  assert.ok(layout.fontSize >= 14 && layout.weight >= 600 && layout.opacity > .8, "First-platform statement lost prominence: " + JSON.stringify(layout));
  assert.ok(layout.width > 100 && layout.height >= 16, "First-platform statement is clipped");
  assert.ok(layout.top >= 0 && layout.top <= layout.headingBottom + 220, "First-platform statement is too far from the main title");
  return layout;
}

async function setTheme(page, theme) {
  const isDark = await page.locator("html").evaluate(element => element.classList.contains("dark"));
  if (isDark !== (theme === "dark")) {
    await page.getByRole("button", { name: theme === "dark" ? "تفعيل الوضع الليلي" : "تفعيل الوضع الفاتح", exact: true }).click();
  }
  await page.waitForFunction(expected => document.documentElement.classList.contains("dark") === expected, theme === "dark");
  await page.getByRole("button", { name: theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الليلي", exact: true }).waitFor();
}

async function checkTabs(page) {
  const gateway = page.locator('section[aria-labelledby="home-gateway-title"]');
  for (const intent of intents) {
    const tab = gateway.getByRole("tab", { name: intent.label, exact: true });
    await tab.click();
    await page.waitForFunction(id => document.getElementById(id)?.getAttribute("aria-selected") === "true", "home-intent-" + intent.id);
    assert.equal(await tab.getAttribute("id"), "home-intent-" + intent.id);
    assert.equal(await tab.getAttribute("tabindex"), "0");
    assert.equal(await gateway.locator('[role="tab"][aria-selected="true"]').count(), 1);
    assert.equal(await page.locator("#home-intent-panel").getAttribute("aria-labelledby"), "home-intent-" + intent.id);
    if (intent.href) assert.equal(await gateway.locator('a[href="' + intent.href + '"]').first().isVisible(), true, intent.label + " does not expose its real service link");
    await assertNoOverflow(page, "Hero tab " + intent.id);
  }
  const course = gateway.getByRole("tab", { name: intents[0].label, exact: true });
  await course.click();
  await course.focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => document.activeElement?.id === "home-intent-slides");
  assert.equal(await page.locator("#home-intent-slides").getAttribute("aria-selected"), "true");
  await page.keyboard.press("End");
  await page.waitForFunction(() => document.activeElement?.id === "home-intent-quiz");
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => document.activeElement?.id === "home-intent-course");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => document.activeElement?.id === "home-intent-quiz");
  await page.keyboard.press("Home");
  await page.waitForFunction(() => document.activeElement?.id === "home-intent-course");
}

async function checkHeroSearch(page, baseURL, theme, screenshotPath) {
  const search = page.getByRole("combobox", { name: "البحث عن جامعة أو تخصص أو مادة", exact: true });
  await search.fill("جامعة");
  const results = page.getByRole("listbox", { name: "نتائج البحث المقترحة", exact: true });
  await results.waitFor();
  const first = results.getByRole("option").first();
  const destination = await first.getAttribute("href");
  assert.match(destination || "", /^\/(courses|universities)\//, "Search must return a real catalog entry");
  await assertNoOverflow(page, "Expanded homepage search");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await search.press("ArrowDown");
  assert.equal(await first.getAttribute("aria-selected"), "true");
  assert.equal(await search.getAttribute("aria-activedescendant"), await first.getAttribute("id"));
  await Promise.all([page.waitForURL(url => url.pathname === new URL(destination, baseURL).pathname), search.press("Enter")]);
  assert.equal(new URL(page.url()).pathname, destination);
  await page.goto(baseURL, { waitUntil: "load" });
  await setTheme(page, theme);
  const reopened = page.getByRole("combobox", { name: "البحث عن جامعة أو تخصص أو مادة", exact: true });
  await reopened.fill("zzzz-responsive-no-match");
  const fallback = page.getByRole("listbox", { name: "نتائج البحث المقترحة", exact: true }).getByRole("option");
  await fallback.waitFor();
  assert.equal(await fallback.getAttribute("href"), "/request-course");
  await reopened.press("Escape");
  assert.equal(await reopened.getAttribute("aria-expanded"), "false");
  await reopened.fill("فيزياء");
  await Promise.all([
    page.waitForURL(url => url.pathname === "/courses" && url.searchParams.get("q") === "فيزياء"),
    page.getByRole("button", { name: "ابحث الآن", exact: true }).click(),
  ]);
  assert.equal(new URL(page.url()).searchParams.get("q"), "فيزياء");
}

async function checkUniversityFilters(page, baseURL, theme, screenshotPath) {
  await page.goto(baseURL + "/universities", { waitUntil: "load" });
  await setTheme(page, theme);
  const select = page.getByRole("combobox", { name: "نوع الجهة", exact: true });
  const before = await page.locator(".university-catalog-grid .university-card").count();
  assert.ok(before > 0, "The university catalog is empty");
  await select.click();
  const search = page.getByRole("combobox", { name: "ابحث في الخيارات...", exact: true });
  await search.fill("اهلية");
  assert.equal(await page.getByRole("option", { name: "أهلية", exact: true }).count(), 1);
  await search.press("Enter");
  assert.equal((await select.innerText()).trim(), "أهلية");
  assert.equal(await page.locator("select").first().inputValue(), "أهلية");
  const kinds = await page.locator(".university-catalog-grid .university-card .type-pill").allTextContents();
  assert.ok(kinds.length > 0 && kinds.length < before, "Selecting institution type did not filter real results");
  assert.ok(kinds.every(kind => kind.trim() === "أهلية"));
  await select.click();
  await search.fill("خيار غير موجود");
  assert.equal(await page.getByText("لا توجد نتائج مطابقة. جرّب اسمًا آخر.", { exact: true }).isVisible(), true);
  await assertNoOverflow(page, "Open searchable institution filter");
  await search.press("Escape");
  assert.equal(await select.getAttribute("aria-expanded"), "false");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await assertNoOverflow(page, "Filtered universities");
  await assertReducedMotion(page);
}

(async () => {
  const baseURL = (process.env.MARAS_TEST_URL || "http://localhost:3000").replace(/\/$/, "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname), "This QA script only targets a local development server");
  const browser = await chromium.launch({ headless: true, channel: process.env.MARAS_TEST_BROWSER || "msedge" });
  const folder = path.resolve("outputs/responsive-review", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(folder, { recursive: true });
  const results = [];
  let homepageSignature;
  try {
    for (const width of widths) {
      for (const theme of themes) {
        const context = await browser.newContext({ viewport: { width, height: 950 }, colorScheme: "light", reducedMotion: "reduce" });
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        page.setDefaultNavigationTimeout(60_000);
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        const stem = theme + "-" + width;
        try {
          const response = await page.goto(baseURL, { waitUntil: "load" });
          assert.equal(response?.status(), 200);
          await page.getByRole("heading", { level: 1 }).waitFor();
          await setTheme(page, theme);
          await page.evaluate(() => document.fonts.ready);
          assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
          await assertNoOverflow(page, "Homepage " + stem);
          const palette = await assertOfficialPalette(page, theme);
          const claim = await assertProminentClaim(page);
          homepageSignature ||= await homepageContentSignature(page);
          await assertHomepageContentParity(page, homepageSignature);
          await assertHomepageCardsReadable(page);
          await assertHomepageRailsReachable(page);
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          assert.ok(await page.getByText("السجل التجاري", { exact: true }).count() > 0);
          await assertReducedMotion(page);
          await checkTabs(page);
          await page.screenshot({ path: path.join(folder, "home-" + stem + ".png"), fullPage: true });
          await checkHeroSearch(page, baseURL, theme, path.join(folder, "search-" + stem + ".png"));
          await checkUniversityFilters(page, baseURL, theme, path.join(folder, "universities-" + stem + ".png"));
          assert.deepEqual(errors, [], "Browser runtime errors");
          results.push({ width, theme, status: "passed", rtl: true, searchNavigation: true, tabs: true, searchableSelect: true, contentParity: true, readableCards: true, lastRailCardsReachable: true, reducedMotion: true, palette, claim, runtimeErrors: errors.length });
        } catch (error) {
          await page.screenshot({ path: path.join(folder, "failure-" + stem + ".png"), fullPage: true }).catch(() => undefined);
          results.push({ width, theme, status: "failed", error: error instanceof Error ? error.message : String(error), runtimeErrors: errors });
        } finally { await context.close(); }
      }
    }
    const report = { ok: results.every(result => result.status === "passed"), results, screenshots: folder };
    fs.writeFileSync(path.join(folder, "results.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
