import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("adaptive video schema tracks processing jobs and private renditions", async () => {
  const [schema, migration] = await Promise.all([read("db/schema.ts"), read("drizzle/0018_adaptive_video_pipeline.sql")]);
  for (const value of ["processingStatus", "hlsMasterObjectKey", "thumbnailObjectKey", "videoRenditions", "videoProcessingJobs"]) assert.match(schema, new RegExp(value));
  assert.match(migration, /video_renditions/);
  assert.match(migration, /video_processing_jobs/);
  assert.match(migration, /ON DELETE CASCADE/);
  assert.match(migration, /video_processing_jobs_claim_idx/);
});

test("storage uses private S3-compatible signing with a local fallback", async () => {
  const storage = await read("lib/storage.ts");
  assert.match(storage, /AWS4-HMAC-SHA256/);
  assert.match(storage, /S3_ENDPOINT/);
  assert.match(storage, /activeStorageProvider/);
  assert.match(storage, /provider === "local"/);
  assert.match(storage, /AbortSignal\.timeout/);
  assert.match(storage, /deletePrefix/);
  assert.match(storage, /checkStorageReadiness/);
});

test("worker creates HLS renditions without making the original unavailable", async () => {
  const [processing, upload, worker] = await Promise.all([read("lib/video-processing.ts"), read("app/api/admin/videos/route.ts"), read("scripts/video-worker.ts")]);
  for (const quality of ["360p", "480p", "720p", "1080p"]) assert.match(processing, new RegExp(quality));
  assert.match(processing, /-hls_playlist_type/);
  assert.match(processing, /FOR UPDATE SKIP LOCKED/);
  assert.match(processing, /retry_wait/);
  assert.match(processing, /الفيديو الأصلي ما زال متاحًا/);
  assert.match(upload, /status: "ready"/);
  assert.match(upload, /enqueueVideoProcessing/);
  assert.match(worker, /runVideoProcessingBatch/);
});

test("signed HLS delivery rewrites child URLs and keeps source fallback", async () => {
  const [session, hls, player, nativePlayer] = await Promise.all([read("app/api/video/session/route.ts"), read("app/api/video/[lessonId]/hls/[...path]/route.ts"), read("components/secure-video-player.tsx"), read("mobile/app/lesson/[courseSlug]/[lessonId].tsx")]);
  assert.match(session, /sourceUrl/);
  assert.match(session, /hlsUrl/);
  assert.match(session, /nativeApp && hlsUrl \? hlsUrl : sourceUrl/);
  assert.match(hls, /authorizeVideoRequest/);
  assert.match(hls, /manifestWithGrant/);
  assert.match(hls, /videoRenditions/);
  assert.match(player, /canPlayType\("application\/vnd\.apple\.mpegurl"\)/);
  assert.match(player, /import\("hls\.js"\)/);
  assert.match(player, /Hls\.isSupported\(\)/);
  assert.match(player, /posterSource/);
  assert.match(nativePlayer, /session\.adaptive \? "hls" : "progressive"/);
});
