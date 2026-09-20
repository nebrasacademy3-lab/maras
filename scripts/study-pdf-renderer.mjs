// Isolated server-owned renderer. No database, storage, provider or application
// credential is inherited. Input is data, never JavaScript/HTML supplied by a user.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { buildStudyPdfDocument, MAX_PDF_BYTES, StudyPdfError } from "../lib/study-pdf-document.mjs";
import { buildInstructorContractDocument } from "../lib/instructor-contract-document.mjs";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
let child, browser, done = false;
const close = async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const closed = new Promise(resolve => child.once("close", resolve));
    child.kill("SIGTERM"); const force = setTimeout(() => child?.kill("SIGKILL"), 500);
    await closed; clearTimeout(force);
  }
  await browser?.close().catch(() => {});
};
const stop = async () => { if (done) return; done = true; await close(); process.exit(1); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
const deadline = setTimeout(stop, 40_000);
try {
  let size = 0; const parts = [];
  for await (const part of process.stdin) { size += part.length; if (size > 650_000) throw new StudyPdfError("PDF_INPUT_INVALID"); parts.push(part); }
  const input = JSON.parse(Buffer.concat(parts).toString("utf8"));
  const logo = `data:image/png;base64,${(await readFile(join(root, "public/brand/logo-light-hq.png"))).toString("base64")}`;
  const cssPath = require.resolve("katex/dist/katex.min.css"), fontRoot = dirname(cssPath);
  let mathCss = await readFile(cssPath, "utf8");
  const fonts = [...mathCss.matchAll(/src:url\((fonts\/[A-Za-z0-9_-]+\.woff2)\)[^;]*;/g)];
  for (const match of fonts) {
    const data = await readFile(join(fontRoot, match[1]));
    mathCss = mathCss.replace(match[0], `src:url(data:font/woff2;base64,${data.toString("base64")}) format('woff2');`);
  }
  if (/url\((?!data:)/.test(mathCss) || mathCss.length > 2_000_000) throw new StudyPdfError("PDF_ASSET_INVALID");
  const document = process.argv[2] === "contract" ? buildInstructorContractDocument(input, { logo }) : buildStudyPdfDocument(input, { logo, mathCss });
  const qa = process.env.MARAS_PDF_ISOLATED_QA === "1";
  // Production never silently disables Chromium's sandbox when unavailable.
  // No detached browser session: the entire tree shares the renderer's process
  // group, so a parent deadline also kills descendants during browser startup.
  child = spawn(process.env.MARAS_PDF_CHROMIUM || "/usr/bin/chromium", [
    "--headless", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
    `--user-data-dir=${process.env.TMPDIR}/browser-profile`, "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-extensions", "--disable-sync", "--disable-default-apps",
    "--disable-component-update", "--disable-dev-shm-usage", "--no-proxy-server",
    "--host-resolver-rules=MAP * ~NOTFOUND", "--disk-cache-size=0", "--media-cache-size=0",
    "--password-store=basic", "--use-mock-keychain", "--js-flags=--max-old-space-size=128",
    ...(qa ? ["--no-sandbox"] : []),
  ], { detached: false, stdio: ["ignore", "ignore", "pipe"], env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: "C.UTF-8" } });
  const pid = child.pid;
  if (pid) process.stderr.write(`PDF_BROWSER_PID:${pid}\n`);
  const endpoint = await new Promise((resolve, reject) => {
    let diagnostic = "";
    const timer = setTimeout(() => reject(new StudyPdfError("PDF_RENDER_TIMEOUT")), 15_000);
    const fail = () => { clearTimeout(timer); reject(new StudyPdfError("PDF_RENDER_UNAVAILABLE")); };
    child.once("error", fail); child.once("exit", fail);
    child.stderr.on("data", data => {
      diagnostic = (diagnostic + data.toString("utf8")).slice(-8192);
      const found = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-zA-Z0-9-]+)/.exec(diagnostic);
      if (found) { clearTimeout(timer); resolve(found[1]); }
    });
  });
  browser = await chromium.connectOverCDP(endpoint, { timeout: 10_000 });
  const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block", acceptDownloads: false, locale: "ar-SA", colorScheme: "light" });
  let requests = 0;
  await context.route("**/*", route => { requests++; return route.abort("blockedbyclient"); });
  const page = await context.newPage();
  await page.setContent(document.html, { waitUntil: "load", timeout: 10_000 });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.evaluate(() => {
    const width = 178 * 96 / 25.4;
    document.body.style.width = `${width}px`;
    let bad = false;
    for (const element of document.querySelectorAll(".display-math")) {
      const actual = element.querySelector(".katex-html")?.getBoundingClientRect().width || element.scrollWidth;
      if (actual > width) {
        const factor = width / actual;
        if (factor < 0.75) bad = true;
        else element.style.fontSize = `${factor}em`;
      }
    }
    if (document.body.scrollWidth > width + 4) bad = true;
    return { bad, height: document.body.scrollHeight };
  });
  if (requests || layout.bad || layout.height > 180_000) throw new StudyPdfError("PDF_LAYOUT_OVERFLOW", "محتوى عريض أو طويل لا يمكن تنسيقه دون قص. راجع تنسيق النتيجة ثم أعد التصدير.");
  const bytes = await page.pdf({ format: "A4", displayHeaderFooter: true, headerTemplate: document.header, footerTemplate: document.footer, printBackground: true, tagged: true, outline: true, preferCSSPageSize: true, margin: { top: "35mm", bottom: "22mm", left: "16mm", right: "16mm" }, timeout: 15_000 });
  if (bytes.length > MAX_PDF_BYTES || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new StudyPdfError("PDF_OUTPUT_LIMIT");
  await close(); child = undefined; browser = undefined;
  if (pid) process.stderr.write(`PDF_BROWSER_EXIT:${pid}\n`);
  done = true; clearTimeout(deadline);
  process.stdout.write(bytes);
} catch (error) {
  clearTimeout(deadline); await close();
  process.stderr.write(JSON.stringify({ code: error instanceof StudyPdfError ? error.code : "PDF_RENDER_UNAVAILABLE" }) + "\n");
  process.exitCode = 1;
}
