/** Read-only visual/interaction QA against the dedicated synthetic loopback app. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";

const origin = "http://127.0.0.1:3100";
const fixtures = JSON.parse(readFileSync(".data/qa-fixtures.json", "utf8"));
assert.equal(fixtures.origin, origin, "Dedicated loopback fixtures required; never run against production.");
const engines = { chromium, firefox, webkit };
const requested = [...new Set((process.env.QA_BROWSERS || "chromium,firefox,webkit").split(",").map(value => value.trim()).filter(Boolean))];
assert.ok(requested.length && requested.every(name => engines[name]), "QA_BROWSERS must name chromium, firefox or webkit.");
for (const role of ["student-a", "admin"]) assert.ok(fixtures.users.some(user => user.role === role && user.token), "Missing synthetic role " + role);
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const output = join("output", "playwright", "experience-runs", runId);
mkdirSync(output, { recursive: true });
const report = { at: new Date().toISOString(), synthetic: true, origin, host: process.platform, requested, checks: [], errors: [], unavailable: [], observations: [], headers: [], status: "running" };
const save = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
function safeMessage(error) {
  let message = String(error?.message || error);
  for (const user of fixtures.users) if (user.token) message = message.replaceAll(user.token, "[redacted]");
  return message.replace(/([?&](?:token|session|signature|key|authorization)=)[^&\s]+/gi, "$1[redacted]").slice(0, 1600);
}
function recordError(context, error) { report.errors.push({ ...context, error: safeMessage(error) }); save(); }
async function ready(page, route, dark = false, fontScale = 1) {
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 60_000 });
  // Palette is applied by the mounted appearance provider. Headings alone are SSR.
  await page.waitForFunction(({ dark, fontScale }) => {
    const root = document.documentElement;
    return Boolean(root.dataset.palette) && root.classList.contains("dark") === dark && Number(getComputedStyle(root).getPropertyValue("--font-scale")) === fontScale && document.fonts.status === "loaded";
  }, { dark, fontScale }, { timeout: 20_000 });
  if (route === "/admin") {
    await page.getByText("جارٍ تحميل بيانات التشغيل", { exact: true }).waitFor({ state: "hidden", timeout: 45_000 });
    await page.locator(".live-loading").waitFor({ state: "hidden", timeout: 45_000 });
    await page.locator(".admin-metrics").waitFor({ state: "visible", timeout: 45_000 });
  }
}
async function dimensions(page, width) {
  // WebKit on Windows can return the previous scroll extent immediately after a
  // viewport change. Wait for paint, then require three equal layout samples.
  const paint = await page.evaluate(() => new Promise(resolve => {
    const deadline = setTimeout(() => resolve("timer-fallback"), 300);
    requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(deadline); resolve("two-frames"); }));
  }));
  let previous = "", stable = 0, measure;
  for (let sample = 0; sample < 30; sample++) {
    measure = await page.evaluate(() => {
      // Reading box geometry forces pending style/layout before scroll geometry.
      const box = document.body.getBoundingClientRect();
      return { viewport: innerWidth, document: document.documentElement.scrollWidth, bodyWidth: box.width, fontScale: Number(getComputedStyle(document.documentElement).getPropertyValue("--font-scale")), dark: document.documentElement.classList.contains("dark") };
    });
    const key = JSON.stringify(measure);
    stable = key === previous ? stable + 1 : 1;
    if (measure.viewport === width && stable >= 3) return { ...measure, paint };
    previous = key;
    await page.waitForTimeout(75); // A bounded sample interval, not page readiness.
  }
  throw new Error("Viewport layout did not settle: " + JSON.stringify(measure));
}
async function overflowElements(page) {
  return page.evaluate(() => [...document.querySelectorAll("body *")].filter(element => {
    const box = element.getBoundingClientRect();
    if (!box.width || (box.left >= -1 && box.right <= innerWidth + 1)) return false;
    // Exclude intentional scroll containers (for example the mobile tab strip).
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) if (["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(parent).overflowX)) return false;
    return true;
  }).slice(0, 20).map(element => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return { tag: element.tagName, class: typeof element.className === "string" ? element.className : "svg", left: box.left, right: box.right, width: box.width, minWidth: style.minWidth, grid: style.gridTemplateColumns, overflow: style.overflow };
  }));
}
async function checkWidth(page, context, width, dark = false) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 1080 });
  const measure = await dimensions(page, width);
  const check = { ...context, width, dark, fontScale: measure.fontScale, overflow: measure.document - measure.viewport, paint: measure.paint, passed: measure.document <= measure.viewport + 1 && measure.dark === dark && measure.fontScale === (dark ? 1.2 : 1) };
  report.checks.push(check);
  if (!check.passed) recordError({ ...context, width, elements: await overflowElements(page) }, new Error("Responsive layout mismatch: " + JSON.stringify(measure)));
  save();
}
async function interact(page, context) {
  if (context.route === "/") {
    const summary = page.getByRole("tab", { name: "لخّص لي", exact: true });
    await summary.click();
    await page.getByRole("link", { name: "أنشئ ملخصًا", exact: false }).waitFor();
    await summary.press("End");
    assert.equal(await page.getByRole("tab", { name: "اختبرني", exact: true }).getAttribute("aria-selected"), "true");
    await page.getByRole("tab", { name: "أبحث عن مادة", exact: true }).click();
    report.checks.push({ ...context, interaction: "keyboard and pointer intent navigation", passed: true });
  }
  if (context.route === "/dashboard") {
    await page.getByRole("button", { name: "الطلبات والفواتير", exact: true }).filter({ visible: true }).first().click();
    await page.getByRole("heading", { name: "الطلبات والفواتير", exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get("view"), "orders");
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /أهلًا/ }).waitFor();
    report.checks.push({ ...context, interaction: "dashboard section and browser history", passed: true });
  }
}
save();
for (const engine of requested) {
  let browser;
  const installedChrome = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : "";
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (installedChrome && existsSync(installedChrome) ? installedChrome : undefined);
  try { browser = await engines[engine].launch({ headless: true, timeout: 30_000, ...(engine === "chromium" && executablePath ? { executablePath } : {}) }); }
  catch (error) { report.unavailable.push({ engine, reason: safeMessage(error) }); save(); console.log(engine + ": unavailable on " + process.platform); continue; }
  try {
    for (const role of ["student-a", "admin"]) {
      const user = fixtures.users.find(row => row.role === role);
      const context = await browser.newContext({ locale: "ar-SA", reducedMotion: "reduce", viewport: { width: 1440, height: 1080 }, storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: "meras-theme", value: "light" }, { name: "meras-font-scale", value: "1" }] }] } });
      context.setDefaultTimeout(20_000); context.setDefaultNavigationTimeout(60_000);
      await context.addCookies([{ name: "meras_session", value: user.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
      try {
        for (const route of role === "admin" ? ["/admin"] : ["/", "/dashboard", "/courses", "/study-tools", "/learn/qa-physics"]) {
          const scope = { engine, role, route }, page = await context.newPage();
          let phase = "navigation";
          page.on("pageerror", error => recordError({ ...scope, phase, category: /access control/i.test(error.message) ? "loopback-browser-access" : "javascript" }, error));
          page.on("requestfailed", request => {
            if (!/access control/i.test(request.failure()?.errorText || "")) return;
            const headers = request.headers();
            report.observations.push({ ...scope, phase, kind: "access-control", path: new URL(request.url()).pathname, requestOrigin: headers.origin || null, secFetchSite: headers["sec-fetch-site"] || null, error: safeMessage(request.failure()?.errorText) });
          });
          console.log(engine + " " + role + " " + route);
          try {
            const response = await page.goto(origin + route, { waitUntil: "domcontentloaded" });
            assert.equal(response.status(), 200, "Expected ready page: " + route);
            assert.equal(new URL(page.url()).pathname, route, "Unexpected redirect");
            const headers = await response.allHeaders();
            report.headers.push({ ...scope, values: Object.fromEntries(Object.entries(headers).filter(([key]) => /^(content-security-policy|origin-agent-cluster|cross-origin|access-control)/.test(key))) });
            await ready(page, route); phase = "active";
            for (const width of [360, 768, 1440]) await checkWidth(page, scope, width);
            await interact(page, scope);
            const name = engine + "-" + (route === "/" ? "home" : route.slice(1).replaceAll("/", "-"));
            await page.screenshot({ path: join(output, name + "-desktop.png") });
            // Read-only probe distinguishes stable same-origin access from unload
            // cancellations; neither response headers nor browser security change.
            const probe = await page.evaluate(async () => {
              const controller = new AbortController(), deadline = setTimeout(() => controller.abort(), 10_000);
              try { const response = await fetch("/api/public/settings", { signal: controller.signal, cache: "no-store" }); return { status: response.status }; }
              catch (error) { return { error: String(error.message) }; }
              finally { clearTimeout(deadline); }
            });
            report.observations.push({ ...scope, kind: "stable-same-origin-probe", ...probe });
            if (probe.status !== 200) recordError({ ...scope, category: "loopback-browser-access" }, new Error("Same-origin settings probe failed: " + JSON.stringify(probe)));
            // Use the real appearance preferences, then reload the same route.
            await page.evaluate(() => { localStorage.setItem("meras-theme", "dark"); localStorage.setItem("meras-font-scale", "1.2"); });
            phase = "reload";
            await page.reload({ waitUntil: "domcontentloaded" });
            await ready(page, route, true, 1.2); phase = "active";
            await checkWidth(page, scope, 390, true);
            await page.screenshot({ path: join(output, name + "-dark-mobile.png") });
          } catch (error) { recordError({ ...scope, phase }, error); }
          finally { phase = "closing"; await page.evaluate(() => { localStorage.setItem("meras-theme", "light"); localStorage.setItem("meras-font-scale", "1"); }).catch(() => undefined); await page.close(); save(); }
        }
      } finally { await context.close(); }
    }
  } catch (error) { recordError({ engine }, error); }
  finally { await browser.close(); save(); }
}
report.finishedAt = new Date().toISOString();
report.status = report.errors.length ? "failed" : report.unavailable.length ? "available-engines-passed-with-unavailable-engines" : "passed";
save();
console.log(JSON.stringify({ report: join(output, "report.json"), status: report.status, checks: report.checks.length, passed: report.checks.filter(check => check.passed).length, errors: report.errors.length, unavailable: report.unavailable.map(item => item.engine) }));
process.exitCode = report.errors.length ? 1 : report.unavailable.length ? 2 : 0;
