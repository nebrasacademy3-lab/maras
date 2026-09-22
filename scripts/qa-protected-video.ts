/** Real private-media pipeline/HTTP/playback QA. No production DB, storage or provider keys. */
import assert from "node:assert/strict";
import { randomUUID, createHash, createDecipheriv } from "node:crypto";
import { execFile } from "node:child_process";
import { request as nodeHttpRequest } from "node:http";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";

const { url } = JSON.parse(readFileSync(".data/qa-database.json", "utf8")) as { url: string };
const database = new URL(url), origin = "http://127.0.0.1:3100";
assert.equal(database.hostname, "127.0.0.1"); assert.equal(database.pathname, "/maras_qa");
assert.equal(process.env.DATABASE_URL, url);
assert.equal(resolve(process.env.UPLOAD_DIR || ""), resolve(".data/uploads"));
for (const key of ["S3_BUCKET", "BUCKET", "RESEND_API_KEY", "TAP_SECRET_KEY", "GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_FREE_API_KEYS", "GEMINI_PAID_API_KEY", "GEMINI_PAID_API_KEYS", "GOOGLE_API_KEY", "OPENAI_API_KEY"]) assert.ok(!process.env[key], `Live provider is prohibited: ${key}`);
const [{ getDb, closeDb }, s, auth, media, storage] = await Promise.all([
  import("../db/index"), import("../db/schema"), import("../lib/auth"), import("../lib/video-processing"), import("../lib/storage"),
]);
const db = getDb(), run = promisify(execFile), now = () => new Date().toISOString();
const output = resolve(".data/protected-video"); mkdirSync(output, { recursive: true });
const privateFixturePath = ".data/qa-media-fixtures.json"; // Never upload this credential-bearing file.
type Fixture = { course: string; lesson: string; assetId: number; user: { id: number; email: string; token: string }; other: { id: number; email: string; token: string }; size: number; digest: string; duration: number; ffmpeg: string };
const digest = (body: Buffer) => createHash("sha256").update(body).digest("hex");
const savedFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  assert.equal(target.origin, origin, "Only the isolated app may receive network requests");
  return savedFetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(20000) });
};
// Node fetch adds Sec-Fetch-Mode; real native clients do not. Use raw loopback HTTP
// for protocol tests rather than changing the server's browser/CSRF classification.
function nativeHttp(path: string, headers: Record<string, string>, body?: string): Promise<Response> {
  assert.ok(path.startsWith("/api/video/"));
  return new Promise((resolve, reject) => {
    const request = nodeHttpRequest(origin + path, { method: body ? "POST" : "GET", headers, timeout: 20000 }, incoming => {
      const chunks: Buffer[] = []; let size = 0;
      incoming.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 8 * 1024 * 1024) request.destroy(new Error("Bounded native QA response exceeded")); else chunks.push(chunk); });
      incoming.on("error", reject);
      incoming.on("end", () => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
        resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode || 500, headers: responseHeaders }));
      });
    });
    request.on("timeout", () => request.destroy(new Error("Native loopback QA timed out"))); request.on("error", reject);
    request.end(body);
  });
}
async function prepare() {
  const nonce = randomUUID().slice(0, 8), course = "qa-media-" + nonce, lesson = course + "-lesson";
  const filename = resolve(output, "source.mp4");
  const { stdout: version } = await run("ffmpeg", ["-version"], { timeout: 10000 });
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "10", "-c:v", "libx264", "-threads", "1", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart", filename], { timeout: 60000 });
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", filename], { timeout: 15000 });
  const probe = JSON.parse(stdout) as { streams: { codec_type: string; codec_name: string }[]; format: { duration: string } };
  assert.ok(probe.streams.some(stream => stream.codec_name === "h264")); assert.ok(probe.streams.some(stream => stream.codec_name === "aac"));
  const duration = Number(probe.format.duration); assert.ok(duration >= 9.9 && duration <= 10.2);
  await db.insert(s.catalogCourses).values({ slug: course, institutionSlug: "qa-university", specialtySlug: "qa-science", title: "فيديو اختبار فعلي", titleEn: "Synthetic private media", status: "published", price: 1 });
  const [unit] = await db.insert(s.courseUnitsDb).values({ courseSlug: course, title: "وحدة اختبار الفيديو", status: "published" }).returning();
  await db.insert(s.lessonsDb).values({ id: lesson, courseSlug: course, unitId: unit.id, title: "اختبار تشغيل محمي", freePreview: false, durationSeconds: 10, status: "published" });
  const original = readFileSync(filename), objectKey = `qa-media/${nonce}/source.mp4`;
  await storage.putFileObject(objectKey, filename, "video/mp4", "local");
  const [asset] = await db.insert(s.videoAssets).values({ courseSlug: course, lessonId: lesson, objectKey, contentType: "video/mp4", storageProvider: "local", sizeBytes: original.length, status: "ready", processingStatus: "source_only" }).returning();
  await db.update(s.lessonsDb).set({ videoAssetId: asset.id }).where(eq(s.lessonsDb.id, lesson));
  async function person(label: string) {
    const [user] = await db.insert(s.users).values({ email: `${course}-${label}@example.test`, fullName: "طالب فيديو اصطناعي", role: "student", status: "active", phone: "05" + String((parseInt(nonce, 16) + (label === "owner" ? 0 : 1)) % 100000000).padStart(8, "0"), academicLevel: "1", phoneVerifiedAt: now(), emailVerifiedAt: now(), profileCompletedAt: now(), onboardingCompletedAt: now(), universitySlug: "qa-university", specialty: "علوم الاختبار" }).returning();
    const session = await auth.createSession(user.id, new Request(origin + "/api/auth/login", { headers: { "x-meras-device-id": course + "-" + label } }));
    return { id: user.id, email: user.email, token: session.token };
  }
  const user = await person("owner"), other = await person("other");
  await db.insert(s.courseAccess).values({ userId: user.id, userEmail: user.email, courseSlug: course, startsAt: now(), source: "qa" });
  assert.equal((await db.select().from(s.videoProcessingJobs).where(eq(s.videoProcessingJobs.status, "queued"))).length, 0, "Do not process an unrelated job");
  assert.equal((await media.enqueueVideoProcessing(asset.id)).status, "queued");
  const processed = await media.runVideoProcessingBatch(1);
  assert.equal(processed.processed, 1); assert.equal(processed.failed, 0);
  const ready = await media.videoProcessingSummary(asset.id);
  assert.equal(ready?.processingStatus, "ready"); assert.equal(ready.processingProgress, 100);
  assert.ok(ready.renditions.some(row => row.height === 180 && row.status === "ready"));
  assert.ok(ready.thumbnailObjectKey);
  const fixture: Fixture = { course, lesson, assetId: asset.id, user, other, size: original.length, digest: digest(original), duration, ffmpeg: version.split("\n")[0] };
  writeFileSync(privateFixturePath, JSON.stringify(fixture), { mode: 0o600 });
  console.log("PASS MEDIA real H264/AAC fixture processed by the application worker into HLS and thumbnail");
}
async function verify() {
  const f = JSON.parse(readFileSync(privateFixturePath, "utf8")) as Fixture;
  assert.match(f.course, /^qa-media-[a-f0-9]{8}$/); assert.equal(f.lesson, f.course + "-lesson");
  const checks: string[] = ["actual H264/AAC source processed into private HLS segments and a thumbnail"];
  const pass = (label: string) => { checks.push(label); console.log("PASS MEDIA", label); };
  const headers = (token = f.user.token, native = false): Record<string, string> => token ? native ? { authorization: `Bearer ${token}`, "x-meras-client": "mobile-v1", "x-meras-platform": "android" } : { cookie: `${auth.SESSION_COOKIE}=${token}` } : {};
  const request = (path: string, token = f.user.token, extra: Record<string, string> = {}, method = "GET", native = false) => {
    assert.ok(path.startsWith("/api/video/"));
    if (native) { assert.equal(method, "GET"); return nativeHttp(path, { ...headers(token, true), ...extra }); }
    return fetch(origin + path, { method, headers: { ...headers(token), ...extra } });
  };
  async function denied(path: string, status: number, token = f.user.token, native = false) {
    const response = await request(path, token, {}, "GET", native);
    assert.equal(response.status, status); await response.body?.cancel();
  }
  async function session(native = false, token = f.user.token) {
    const bodyText = JSON.stringify({ courseSlug: f.course, lessonId: f.lesson });
    const requestHeaders = { ...headers(token, native), ...(native ? {} : { origin }), "content-type": "application/json" };
    const response = await (native ? nativeHttp("/api/video/session", requestHeaders, bodyText) : fetch(origin + "/api/video/session", { method: "POST", headers: requestHeaders, body: bodyText }));
    assert.equal(response.status, 200);
    const body = await response.json() as { sourceUrl: string; hlsUrl: string; thumbnailUrl: string; streamUrl: string; adaptive: boolean; encrypted: boolean; qualities: {label:string}[] };
    for (const path of [body.sourceUrl, body.hlsUrl, body.thumbnailUrl]) assert.ok(path.startsWith(`/api/video/${f.lesson}`));
    assert.equal(body.adaptive, true); assert.equal(body.encrypted, true); return body;
  }
  const web = await session();
  const originalUrl = new URL(web.hlsUrl, origin); originalUrl.pathname = `/api/video/${f.lesson}`;
  for (const method of ["GET","HEAD"]) { const original = await request(originalUrl.pathname + originalUrl.search, f.user.token, {range:"bytes=8-63"}, method); assert.equal(original.status,403); await original.body?.cancel(); }
  const head = await request(web.hlsUrl, f.user.token, {}, "HEAD"); assert.equal(head.status,200); assert.equal((await head.arrayBuffer()).byteLength,0);
  pass("original MP4 and range requests are denied, while encrypted HLS HEAD remains usable");
  await denied(web.sourceUrl, 401, ""); await denied(web.sourceUrl, 403, f.other.token);
  await denied(web.hlsUrl, 401, ""); await denied(web.hlsUrl, 403, f.other.token);
  const master = await (await request(web.hlsUrl)).text();
  const variantPath = master.split("\n").find(line => line && !line.startsWith("#"))!;
  const variantUrl = new URL(variantPath, origin + web.hlsUrl); assert.equal(variantUrl.origin, origin); assert.ok(variantUrl.searchParams.get("token"));
  const variant = await (await request(variantUrl.pathname + variantUrl.search)).text();
  const segmentPath = variant.split("\n").find(line => line && !line.startsWith("#"))!;
  const segmentUrl = new URL(segmentPath, variantUrl); assert.equal(segmentUrl.origin, origin); assert.ok(segmentUrl.searchParams.get("token"));
  const segment = segmentUrl.pathname + segmentUrl.search;
  const response = await request(segment); assert.equal(response.status, 200);
  const encrypted = Buffer.from(await response.arrayBuffer());
  const keyLine = /^#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)",IV=0x([a-f0-9]{32})$/m.exec(variant); assert.ok(keyLine,"segment playlist declares an authorized AES key and explicit IV");
  const keyUrl = new URL(keyLine[1],variantUrl), keyPath = keyUrl.pathname+keyUrl.search;
  await denied(keyPath,401,""); await denied(keyPath,403,f.other.token);
  const keyResponse=await request(keyPath);assert.equal(keyResponse.status,200);assert.match(keyResponse.headers.get("cache-control")||"",/no-store/);
  const keyBytes=Buffer.from(await keyResponse.arrayBuffer());assert.equal(keyBytes.length,16);
  const decipher=createDecipheriv("aes-128-cbc",keyBytes,Buffer.from(keyLine[2],"hex"));
  const clear=Buffer.concat([decipher.update(encrypted),decipher.final()]);assert.notDeepEqual(encrypted,clear);
  const segmentFile = resolve(output, "received-segment.ts"); writeFileSync(segmentFile, clear);
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name", "-of", "json", segmentFile], { timeout: 15000 });
  const codecs = JSON.parse(stdout) as { streams: { codec_name: string }[] };
  assert.ok(codecs.streams.some(stream => stream.codec_name === "h264")); assert.ok(codecs.streams.some(stream => stream.codec_name === "aac"));
  await denied(segment, 401, ""); await denied(segment, 403, f.other.token);
  pass("encrypted HLS decrypts to real H264/AAC only with the session-authorized key; other accounts cannot fetch segments or keys");
  const browserTested = !process.argv.includes("--http-only");
  if (browserTested) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "ar-SA", reducedMotion: "reduce" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addCookies([{ name: auth.SESSION_COOKIE, value: f.user.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage(); let clientErrors = 0, hlsSegments = 0;
    page.on("pageerror", () => clientErrors++);
    page.on("response", response => { if (/\/hls\/[^/]+\/segment-\d+\.ts/.test(response.url()) && response.status() === 200) hlsSegments++; });
    await page.goto(origin + "/learn/" + f.course, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => { const video = document.querySelector("video"); return video && video.readyState >= 2 && video.duration >= 9; }, undefined, { timeout: 30000 });
    await page.locator("video").evaluate((video: HTMLVideoElement) => { video.muted = true; });
    await page.getByRole("button", { name: "تشغيل", exact: true }).first().click();
    await page.waitForFunction(() => { const video = document.querySelector("video"); return video && video.currentTime > 1 && !video.paused && !video.error; });
    assert.ok(hlsSegments > 0, "Adaptive playback must fetch HLS rather than silently test only the fallback");
    const adaptive = await page.locator("video").evaluate((video: HTMLVideoElement) => ({ width: video.videoWidth, height: video.videoHeight, decodedFrames: video.getVideoPlaybackQuality().totalVideoFrames }));
    assert.ok(adaptive.width >= 320 && adaptive.decodedFrames > 0);
    await page.getByRole("button", { name: "إيقاف مؤقت", exact: true }).click();
    await page.getByRole("button", { name: "الإعدادات", exact: true }).click();
    await page.getByRole("button", { name: "1.5×", exact: true }).click();
    assert.equal(await page.locator("video").evaluate((video: HTMLVideoElement) => video.playbackRate), 1.5);
    await page.getByRole("button", { name: web.qualities[0].label, exact: true }).click();
    await page.waitForFunction(() => { const video = document.querySelector("video"); return video && video.readyState >= 2 && video.playbackRate === 1.5 && video.paused; });
    const seek = page.getByRole("slider", { name: "التقدم في الفيديو", exact: true });
    const seekBounds = await seek.boundingBox(); assert.ok(seekBounds);
    await seek.click({ position: { x: seekBounds.width / 2, y: seekBounds.height / 2 } });
    await page.waitForFunction(() => { const video = document.querySelector("video"); return video && video.paused && video.currentTime > 3 && video.currentTime < 7; });
    await page.getByRole("button", { name: "تشغيل", exact: true }).first().click();
    await page.waitForFunction(() => { const video = document.querySelector("video"); return video && video.currentTime > 5.3 && !video.error; });
    await page.screenshot({ path: resolve(output, "real-playback.png"), fullPage: true });
    await page.waitForFunction(() => document.querySelector("video")?.ended, undefined, { timeout: 20000 });
    for (let i = 0; i < 40; i++) {
      const [progress] = await db.select().from(s.lessonProgress).where(and(eq(s.lessonProgress.userId, f.user.id), eq(s.lessonProgress.lessonId, f.lesson)));
      if (progress?.completed && progress.watchedSeconds >= 8) break;
      if (i === 39) throw new Error("Real player completion was not persisted");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(clientErrors, 0);
    pass("Chromium decodes session-encrypted HLS, preserves speed and pause across quality changes, seeks, and saves completion");
  } finally { await browser.close(); }
  }
  const native = await session(true); assert.ok(native.streamUrl === native.hlsUrl, "Native session must choose protected HLS");
  const nativeChunk = await request(native.hlsUrl, f.user.token, {}, "GET", true); assert.equal(nativeChunk.status, 200); await nativeChunk.body?.cancel();
  const [setting] = await db.select().from(s.platformSettings).where(eq(s.platformSettings.key, "content_view_mode"));
  try {
    await db.insert(s.platformSettings).values({ key: "content_view_mode", value: "app_only" }).onConflictDoUpdate({ target: s.platformSettings.key, set: { value: "app_only" } });
    await denied(web.sourceUrl, 403);
    const appAllowed = await request(native.sourceUrl, f.user.token, {}, "GET", true); assert.equal(appAllowed.status, 200); await appAllowed.body?.cancel();
    await db.update(s.platformSettings).set({ value: "web_only" }).where(eq(s.platformSettings.key, "content_view_mode"));
    await denied(native.sourceUrl, 403, f.user.token, true);
    pass("native bearer protocol and app-only/web-only content policy are enforced by the server");
  } finally {
    if (setting) await db.update(s.platformSettings).set({ value: setting.value }).where(eq(s.platformSettings.key, setting.key));
    else await db.delete(s.platformSettings).where(eq(s.platformSettings.key, "content_view_mode"));
  }
  await db.update(s.courseAccess).set({ revokedAt: now() }).where(and(eq(s.courseAccess.userId, f.user.id), eq(s.courseAccess.courseSlug, f.course)));
  for (const path of [web.sourceUrl, web.hlsUrl, segment, keyPath]) await denied(path, 403);
  await auth.revokeSession(new Request(origin, { headers: headers() }));
  await denied(web.sourceUrl, 401);
  pass("previously issued HLS/segment/key grants stop after access or session revocation");
  writeFileSync(resolve(output, "report.json"), JSON.stringify({ passed: checks.length, checks, source: { bytes: f.size, duration: f.duration, sha256: f.digest }, ffmpeg: f.ffmpeg, browser: browserTested ? "Chromium real decoder, not mobile hardware" : "NOT RUN (--http-only); not a full acceptance pass", storage: "isolated local private files", liveProviders: false }, null, 2));
}
try {
  if (process.argv.includes("--prepare")) await prepare(); else await verify();
} finally { globalThis.fetch = savedFetch; await closeDb(); }
