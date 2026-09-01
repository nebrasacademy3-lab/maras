import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { basename, extname, join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { lessonsDb, videoAssets, videoProcessingJobs, videoRenditions } from "@/db/schema";
import { deletePrefix, listLocalFiles, materializeObject, putFileObject, putObject, type StorageProvider } from "@/lib/storage";

const execFileAsync = promisify(execFile);
const PROCESSING_UNAVAILABLE_MESSAGE = "المعالجة متعددة الجودات غير متاحة على هذا الخادم حاليًا؛ يبقى الفيديو الأصلي جاهزًا للمشاهدة.";
const PROCESSING_TIMEOUT_MS = 4 * 60 * 60_000;

type Capability = { available: boolean; ffmpegPath: string; ffprobePath: string; message: string };
type ClaimedJob = { id: number; assetId: number; attempts: number; maxAttempts: number; lockedBy: string };
type ProbeResult = { width: number; height: number; duration: number };
type Profile = { label: string; height: number; bitrateKbps: number; audioKbps: number };
type RenditionResult = { qualityLabel: string; width: number; height: number; bitrateKbps: number; manifestObjectKey: string; segmentPrefix: string; sizeBytes: number };

let capabilityCache: { expiresAt: number; value: Capability } | null = null;
let unavailableRecoveryAt = 0;

function executable(name: "ffmpeg" | "ffprobe") {
  return process.env[name === "ffmpeg" ? "VIDEO_FFMPEG_PATH" : "VIDEO_FFPROBE_PATH"]?.trim() || name;
}

async function responds(path: string) {
  try {
    await execFileAsync(path, ["-version"], { timeout: 8_000, windowsHide: true, maxBuffer: 1024 * 1024 });
    return true;
  } catch { return false; }
}

export async function videoProcessingCapability(force = false): Promise<Capability> {
  if (!force && capabilityCache && capabilityCache.expiresAt > Date.now()) return capabilityCache.value;
  const ffmpegPath = executable("ffmpeg");
  const ffprobePath = executable("ffprobe");
  const available = await responds(ffmpegPath) && await responds(ffprobePath);
  const value = { available, ffmpegPath, ffprobePath, message: available ? "المعالجة متعددة الجودات جاهزة" : PROCESSING_UNAVAILABLE_MESSAGE };
  capabilityCache = { expiresAt: Date.now() + 5 * 60_000, value };
  return value;
}

function asRows<T>(result: unknown) {
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) return (result as { rows: T[] }).rows;
  return [];
}

function workerIdentity() {
  return `${hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
}

export async function enqueueVideoProcessing(assetId: number, force = false) {
  const capability = await videoProcessingCapability(force);
  const now = new Date().toISOString();
  const status = capability.available ? "queued" : "unavailable";
  await getDb().transaction(async (tx) => {
    await tx.insert(videoProcessingJobs).values({ assetId, status, attempts: 0, maxAttempts: 5, nextAttemptAt: now, lockedAt: null, lockedBy: null, lastError: capability.available ? null : capability.message, completedAt: null, createdAt: now, updatedAt: now }).onConflictDoUpdate({
      target: videoProcessingJobs.assetId,
      set: { status, attempts: 0, nextAttemptAt: now, lockedAt: null, lockedBy: null, lastError: capability.available ? null : capability.message, completedAt: null, updatedAt: now },
    });
    await tx.update(videoAssets).set({ processingStatus: status, processingProgress: capability.available ? 0 : 100, processingError: capability.available ? null : capability.message, updatedAt: now }).where(eq(videoAssets.id, assetId));
  });
  return { status, capability };
}

async function claimJob(identity: string): Promise<ClaimedJob | null> {
  const now = new Date().toISOString();
  return getDb().transaction(async (tx) => {
    const selected = asRows<{ id: number; asset_id: number; attempts: number; max_attempts: number }>(await tx.execute(sql`
      SELECT id, asset_id, attempts, max_attempts
      FROM video_processing_jobs
      WHERE (
        (status IN ('queued', 'retry_wait') AND next_attempt_at::timestamptz <= CURRENT_TIMESTAMP)
        OR (status = 'processing' AND locked_at::timestamptz <= CURRENT_TIMESTAMP - INTERVAL '30 minutes')
      )
      ORDER BY next_attempt_at::timestamptz ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `));
    const row = selected[0];
    if (!row) return null;
    const attempts = row.attempts + 1;
    await tx.update(videoProcessingJobs).set({ status: "processing", attempts, lockedAt: now, lockedBy: identity, lastError: null, updatedAt: now }).where(eq(videoProcessingJobs.id, row.id));
    await tx.update(videoAssets).set({ processingStatus: "processing", processingProgress: 1, processingError: null, updatedAt: now }).where(eq(videoAssets.id, row.asset_id));
    return { id: row.id, assetId: row.asset_id, attempts, maxAttempts: row.max_attempts, lockedBy: identity };
  });
}

async function probeSource(filename: string, ffprobePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(ffprobePath, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-show_entries", "format=duration", "-of", "json", filename], { timeout: 60_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  const parsed = JSON.parse(stdout) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
  const width = Math.max(2, Math.floor(Number(parsed.streams?.[0]?.width) || 0));
  const height = Math.max(2, Math.floor(Number(parsed.streams?.[0]?.height) || 0));
  const duration = Math.max(0, Number(parsed.format?.duration) || 0);
  if (!width || !height) throw new Error("تعذر التحقق من أبعاد الفيديو الأصلي");
  return { width, height, duration };
}

function profilesFor(sourceHeight: number): Profile[] {
  const candidates: Profile[] = [
    { label: "360p", height: 360, bitrateKbps: 800, audioKbps: 96 },
    { label: "480p", height: 480, bitrateKbps: 1400, audioKbps: 112 },
    { label: "720p", height: 720, bitrateKbps: 2800, audioKbps: 128 },
    { label: "1080p", height: 1080, bitrateKbps: 5000, audioKbps: 160 },
  ];
  const profiles = candidates.filter((profile) => profile.height <= sourceHeight);
  if (profiles.length) return profiles;
  const height = Math.max(144, sourceHeight - (sourceHeight % 2));
  return [{ label: `${height}p`, height, bitrateKbps: Math.max(350, Math.round(height * 2.2)), audioKbps: 96 }];
}

async function runFfmpeg(ffmpegPath: string, args: string[]) {
  await execFileAsync(ffmpegPath, ["-hide_banner", "-nostdin", "-y", ...args], { timeout: PROCESSING_TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
}

function outputWidth(source: ProbeResult, height: number) {
  const scaled = Math.round(source.width * height / source.height);
  return Math.max(2, scaled - (scaled % 2));
}

async function transcodeProfile(sourceFile: string, directory: string, profile: Profile, ffmpegPath: string) {
  await mkdir(directory, { recursive: true });
  await runFfmpeg(ffmpegPath, [
    "-i", sourceFile,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", `scale=-2:${profile.height}:flags=lanczos`,
    "-c:v", "libx264", "-preset", process.env.VIDEO_FFMPEG_PRESET?.trim() || "medium", "-profile:v", "main", "-pix_fmt", "yuv420p",
    "-b:v", `${profile.bitrateKbps}k`, "-maxrate", `${Math.round(profile.bitrateKbps * 1.07)}k`, "-bufsize", `${profile.bitrateKbps * 2}k`,
    "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
    "-c:a", "aac", "-b:a", `${profile.audioKbps}k`, "-ac", "2", "-ar", "48000",
    "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
    "-hls_segment_filename", join(directory, "segment-%05d.ts"), join(directory, "index.m3u8"),
  ]);
}

async function createThumbnail(sourceFile: string, outputFile: string, source: ProbeResult, ffmpegPath: string) {
  const seek = source.duration > 0 ? Math.min(30, Math.max(1, source.duration * 0.1)) : 1;
  await runFfmpeg(ffmpegPath, ["-ss", seek.toFixed(3), "-i", sourceFile, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", outputFile]);
}

function contentTypeFor(filename: string) {
  const extension = extname(filename).toLowerCase();
  if (extension === ".m3u8") return "application/vnd.apple.mpegurl";
  if (extension === ".ts") return "video/mp2t";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function objectPath(root: string, filename: string) {
  return relative(root, filename).split(sep).map((part) => basename(part)).join("/");
}

async function uploadProfile(outputRoot: string, profile: Profile, prefix: string, provider: StorageProvider, source: ProbeResult): Promise<RenditionResult> {
  const directory = join(outputRoot, profile.label);
  const files = await listLocalFiles(directory);
  let sizeBytes = 0;
  for (const file of files) {
    const details = await stat(file);
    sizeBytes += details.size;
    await putFileObject(`${prefix}/${objectPath(outputRoot, file)}`, file, contentTypeFor(file), provider);
  }
  return {
    qualityLabel: profile.label,
    width: outputWidth(source, profile.height),
    height: profile.height,
    bitrateKbps: profile.bitrateKbps,
    manifestObjectKey: `${prefix}/${profile.label}/index.m3u8`,
    segmentPrefix: `${prefix}/${profile.label}`,
    sizeBytes,
  };
}

function masterManifest(source: ProbeResult, profiles: Profile[]) {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-INDEPENDENT-SEGMENTS"];
  for (const profile of profiles) {
    const bandwidth = (profile.bitrateKbps + profile.audioKbps) * 1000;
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},AVERAGE-BANDWIDTH=${Math.round(bandwidth * 0.87)},RESOLUTION=${outputWidth(source, profile.height)}x${profile.height},CODECS="avc1.4d401f,mp4a.40.2"`, `${profile.label}/index.m3u8`);
  }
  return `${lines.join("\n")}\n`;
}

function textStream(value: string) {
  return new Blob([value], { type: "application/vnd.apple.mpegurl" }).stream() as ReadableStream<Uint8Array>;
}

async function updateProgress(job: ClaimedJob, progress: number) {
  const now = new Date().toISOString();
  await getDb().transaction(async (tx) => {
    const [owned] = await tx.select({ id: videoProcessingJobs.id }).from(videoProcessingJobs).where(and(eq(videoProcessingJobs.id, job.id), eq(videoProcessingJobs.status, "processing"), eq(videoProcessingJobs.lockedBy, job.lockedBy))).limit(1);
    if (!owned) throw new Error("توقفت ملكية مهمة معالجة الفيديو");
    await tx.update(videoProcessingJobs).set({ lockedAt: now, updatedAt: now }).where(eq(videoProcessingJobs.id, job.id));
    await tx.update(videoAssets).set({ processingProgress: Math.max(1, Math.min(99, Math.floor(progress))), updatedAt: now }).where(eq(videoAssets.id, job.assetId));
  });
}

async function heartbeatJob(job: ClaimedJob) {
  const now = new Date().toISOString();
  await getDb().update(videoProcessingJobs).set({ lockedAt: now, updatedAt: now }).where(and(eq(videoProcessingJobs.id, job.id), eq(videoProcessingJobs.status, "processing"), eq(videoProcessingJobs.lockedBy, job.lockedBy)));
}

async function finishJob(job: ClaimedJob, source: ProbeResult, prefix: string, masterObjectKey: string, thumbnailObjectKey: string | null, renditions: RenditionResult[]) {
  const now = new Date().toISOString();
  const db = getDb();
  const committed = await db.transaction(async (tx) => {
    const [owned] = await tx.select({ id: videoProcessingJobs.id }).from(videoProcessingJobs).where(and(eq(videoProcessingJobs.id, job.id), eq(videoProcessingJobs.status, "processing"), eq(videoProcessingJobs.lockedBy, job.lockedBy))).limit(1);
    const [asset] = await tx.select({ id: videoAssets.id, durationSeconds: videoAssets.durationSeconds }).from(videoAssets).where(eq(videoAssets.id, job.assetId)).limit(1);
    if (!owned || !asset) return false;
    await tx.delete(videoRenditions).where(eq(videoRenditions.assetId, job.assetId));
    await tx.insert(videoRenditions).values(renditions.map((rendition) => ({ assetId: job.assetId, ...rendition, status: "ready", codec: "h264", audioCodec: "aac", createdAt: now, updatedAt: now })));
    const durationSeconds = Math.max(0, Math.round(source.duration)) || asset.durationSeconds || 0;
    await tx.update(videoAssets).set({ processingStatus: "ready", processingProgress: 100, processingError: null, sourceWidth: source.width, sourceHeight: source.height, hlsMasterObjectKey: masterObjectKey, thumbnailObjectKey, derivativesPrefix: prefix, processedAt: now, durationSeconds: durationSeconds || null, updatedAt: now }).where(eq(videoAssets.id, job.assetId));
    if (durationSeconds) await tx.update(lessonsDb).set({ durationSeconds, updatedAt: now }).where(eq(lessonsDb.videoAssetId, job.assetId));
    await tx.update(videoProcessingJobs).set({ status: "completed", lockedAt: null, lockedBy: null, lastError: null, completedAt: now, updatedAt: now }).where(eq(videoProcessingJobs.id, job.id));
    return true;
  });
  return committed;
}

async function processClaimedJob(job: ClaimedJob, capability: Capability) {
  const [asset] = await getDb().select().from(videoAssets).where(eq(videoAssets.id, job.assetId)).limit(1);
  if (!asset) return;
  const provider = (asset.storageProvider === "s3" ? "s3" : "local") as StorageProvider;
  const temporary = await mkdtemp(join(tmpdir(), `meras-video-${asset.id}-`));
  const sourceFile = join(temporary, `source${extname(asset.objectKey) || ".video"}`);
  const outputRoot = join(temporary, "hls");
  const prefix = `private/video-derived/${asset.id}/${crypto.randomUUID()}`;
  const heartbeat = setInterval(() => { void heartbeatJob(job).catch(() => undefined); }, 60_000);
  heartbeat.unref();
  try {
    if (!await materializeObject(asset.objectKey, sourceFile, provider)) throw new Error("ملف الفيديو الأصلي غير موجود في التخزين الخاص");
    await updateProgress(job, 5);
    const source = await probeSource(sourceFile, capability.ffprobePath);
    const profiles = profilesFor(source.height);
    await mkdir(outputRoot, { recursive: true });
    for (let index = 0; index < profiles.length; index += 1) {
      await transcodeProfile(sourceFile, join(outputRoot, profiles[index].label), profiles[index], capability.ffmpegPath);
      await updateProgress(job, 10 + Math.round((index + 1) / profiles.length * 55));
    }
    const thumbnailFile = join(outputRoot, "thumbnail.jpg");
    let thumbnailObjectKey: string | null = null;
    try { await createThumbnail(sourceFile, thumbnailFile, source, capability.ffmpegPath); }
    catch { /* HLS remains useful even when a source format cannot produce a thumbnail. */ }
    const masterObjectKey = `${prefix}/master.m3u8`;
    await putObject(masterObjectKey, textStream(masterManifest(source, profiles)), "application/vnd.apple.mpegurl", provider);
    const renditions: RenditionResult[] = [];
    for (let index = 0; index < profiles.length; index += 1) {
      renditions.push(await uploadProfile(outputRoot, profiles[index], prefix, provider, source));
      await updateProgress(job, 68 + Math.round((index + 1) / profiles.length * 27));
    }
    try {
      await stat(thumbnailFile);
      thumbnailObjectKey = `${prefix}/thumbnail.jpg`;
      await putFileObject(thumbnailObjectKey, thumbnailFile, "image/jpeg", provider);
    } catch { thumbnailObjectKey = null; }
    const committed = await finishJob(job, source, prefix, masterObjectKey, thumbnailObjectKey, renditions);
    if (!committed) await deletePrefix(prefix, provider).catch(() => undefined);
  } catch (error) {
    await deletePrefix(prefix, provider).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
    await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
  }
}

function safeError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[\r\n\t]+/g, " ").slice(0, 1000) || "فشلت معالجة الفيديو";
}

async function failJob(job: ClaimedJob, error: unknown) {
  const message = safeError(error);
  const exhausted = job.attempts >= job.maxAttempts;
  const retryMinutes = Math.min(60, 2 ** Math.min(job.attempts, 5));
  const now = new Date();
  const nextAttemptAt = new Date(now.getTime() + retryMinutes * 60_000).toISOString();
  await getDb().transaction(async (tx) => {
    const [owned] = await tx.select({ id: videoProcessingJobs.id }).from(videoProcessingJobs).where(and(eq(videoProcessingJobs.id, job.id), eq(videoProcessingJobs.status, "processing"), eq(videoProcessingJobs.lockedBy, job.lockedBy))).limit(1);
    if (!owned) return;
    await tx.update(videoProcessingJobs).set({ status: exhausted ? "failed" : "retry_wait", nextAttemptAt, lockedAt: null, lockedBy: null, lastError: message, updatedAt: now.toISOString() }).where(eq(videoProcessingJobs.id, job.id));
    await tx.update(videoAssets).set({ processingStatus: exhausted ? "failed" : "retrying", processingProgress: 100, processingError: exhausted ? `تعذرت المعالجة متعددة الجودات بعد ${job.attempts} محاولات. الفيديو الأصلي ما زال متاحًا.` : `ستُعاد محاولة المعالجة تلقائيًا. الفيديو الأصلي ما زال متاحًا.`, updatedAt: now.toISOString() }).where(eq(videoAssets.id, job.assetId));
  });
}

async function recoverUnavailableJobs() {
  if (unavailableRecoveryAt > Date.now() - 5 * 60_000) return;
  unavailableRecoveryAt = Date.now();
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`
      WITH recovered AS (
        UPDATE video_processing_jobs
        SET status = 'queued', attempts = 0, next_attempt_at = CURRENT_TIMESTAMP::text,
            locked_at = NULL, locked_by = NULL, last_error = NULL, updated_at = CURRENT_TIMESTAMP::text
        WHERE status = 'unavailable'
        RETURNING asset_id
      )
      UPDATE video_assets
      SET processing_status = 'queued', processing_progress = 0, processing_error = NULL,
          updated_at = CURRENT_TIMESTAMP::text
      WHERE id IN (SELECT asset_id FROM recovered)
    `);
  });
}

export async function runVideoProcessingBatch(limit = 1) {
  const count = Math.max(1, Math.min(10, Math.floor(limit)));
  const capability = await videoProcessingCapability();
  if (!capability.available) return { processed: 0, unavailable: true, message: capability.message };
  await recoverUnavailableJobs();
  const identity = workerIdentity();
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < count; index += 1) {
    const job = await claimJob(identity);
    if (!job) break;
    try { await processClaimedJob(job, capability); processed += 1; }
    catch (error) { failed += 1; await failJob(job, error); }
  }
  return { processed, failed, unavailable: false, message: processed || failed ? "اكتملت دفعة معالجة الفيديو" : "لا توجد فيديوهات بانتظار المعالجة" };
}

export async function videoProcessingSummary(assetId: number) {
  const [asset] = await getDb().select({ id: videoAssets.id, status: videoAssets.status, processingStatus: videoAssets.processingStatus, processingProgress: videoAssets.processingProgress, processingError: videoAssets.processingError, sourceWidth: videoAssets.sourceWidth, sourceHeight: videoAssets.sourceHeight, processedAt: videoAssets.processedAt, thumbnailObjectKey: videoAssets.thumbnailObjectKey }).from(videoAssets).where(eq(videoAssets.id, assetId)).limit(1);
  if (!asset) return null;
  const renditions = await getDb().select({ qualityLabel: videoRenditions.qualityLabel, width: videoRenditions.width, height: videoRenditions.height, bitrateKbps: videoRenditions.bitrateKbps, status: videoRenditions.status }).from(videoRenditions).where(eq(videoRenditions.assetId, assetId));
  return { ...asset, renditions };
}

export { PROCESSING_UNAVAILABLE_MESSAGE };
