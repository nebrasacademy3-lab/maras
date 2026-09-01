import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("content viewing policy is enforced again for every protected stream request", async () => {
  const [session, stream, streamAccess, mobileApi, settings] = await Promise.all([
    read("app/api/video/session/route.ts"),
    read("app/api/video/[lessonId]/route.ts"),
    read("lib/video-access.ts"),
    read("lib/mobile-api.ts"),
    read("lib/platform-settings.ts"),
  ]);
  assert.match(session, /if \(!lesson\.free\)[\s\S]*getContentViewMode/);
  assert.match(session, /const tokenEmail = lesson\.free \? "preview" : email/);
  assert.match(stream, /authorizeVideoRequest\(request, lessonId, courseSlug/);
  assert.match(streamAccess, /if \(!lesson\.freePreview\)[\s\S]*getContentViewMode/);
  assert.match(streamAccess, /if \(grant\.email === "preview"\)/);
  assert.match(streamAccess, /getSessionUser\(request\)/);
  assert.match(stream, /Cross-Origin-Resource-Policy", "cross-origin/);
  assert.match(stream, /Referrer-Policy", "no-referrer/);
  assert.match(streamAccess, /videoAssetId: lessonsDb\.videoAssetId/);
  assert.match(streamAccess, /lesson\.videoAssetId[\s\S]*eq\(videoAssets\.id, lesson\.videoAssetId\)/);
  assert.match(session, /isNativeAppRequest\(request\)/);
  assert.match(mobileApi, /\^Bearer\\s\+\\S\+\$\/i/);
  assert.match(mobileApi, /sec-fetch-site/);
  assert.doesNotMatch(settings, /getContentViewMode[\s\S]*catch \{[\s\S]*return fallback/);
  assert.match(session, /سياسة المشاهدة[\s\S]*503/);
  assert.match(streamAccess, /getContentViewMode\(\)[\s\S]*503/);
});

test("timestamped notes remain account scoped and seekable on web and native", async () => {
  const [migration, notesApi, webRoom, nativeLesson] = await Promise.all([
    read("drizzle/0015_video_experience.sql"),
    read("app/api/mobile/notes/route.ts"),
    read("components/learning-room.tsx"),
    read("mobile/app/lesson/[courseSlug]/[lessonId].tsx"),
  ]);
  assert.match(migration, /timestamp_seconds/);
  assert.match(notesApi, /eq\(lessonNotes\.userEmail, user\.email\)/);
  assert.match(notesApi, /timestampSeconds: noteTime/);
  assert.match(notesApi, /MAX_NOTES_PER_LESSON = 500/);
  assert.match(notesApi, /\.limit\(MAX_NOTES_PER_LESSON\)/);
  assert.match(notesApi, /pg_advisory_xact_lock\(hashtext\([\s\S]*lesson-note:/);
  assert.ok(notesApi.indexOf("pg_advisory_xact_lock") < notesApi.indexOf("const [total]"));
  assert.match(webRoom, /setSeekRequest\(\{ seconds: note\.timestampSeconds/);
  assert.match(nativeLesson, /player\.currentTime = item\.timestampSeconds/);
});

test("native fullscreen retains custom controls, capture protection, and rotation", async () => {
  const [lesson, api] = await Promise.all([
    read("mobile/app/lesson/[courseSlug]/[lessonId].tsx"),
    read("mobile/src/lib/api.ts"),
  ]);
  assert.match(lesson, /fullscreenOptions=\{\{ enable: false \}\}/);
  assert.match(lesson, /ScreenCapture\.preventScreenCaptureAsync/);
  assert.match(lesson, /Platform\.OS !== "web"/);
  assert.match(lesson, /phone-landscape-outline/);
  assert.match(api, /x-meras-platform", Platform\.OS/);
});

test("web fullscreen retains controls and supports rotating the complete player", async () => {
  const [player, css] = await Promise.all([
    read("components/secure-video-player.tsx"),
    read("app/additions.css"),
  ]);
  assert.match(player, /secure-player-stage/);
  assert.match(player, /aria-label="تدوير المشغل"/);
  assert.match(player, /video-rotated/);
  assert.match(css, /rotate\(90deg\)/);
});

test("video uploads update duration with browser metadata and server fallback", async () => {
  const [admin, mobileAdmin, upload] = await Promise.all([
    read("components/admin-dashboard.tsx"),
    read("mobile/app/admin.tsx"),
    read("app/api/admin/videos/route.ts"),
  ]);
  assert.match(admin, /readBrowserVideoDuration/);
  assert.match(mobileAdmin, /await import\("expo-video"\)/);
  assert.match(mobileAdmin, /createVideoPlayer\(null\)/);
  assert.match(mobileAdmin, /addListener\("sourceLoad"/);
  assert.match(mobileAdmin, /"x-meras-duration-seconds"/);
  assert.match(mobileAdmin, /player\.release\(\)/);
  assert.match(upload, /probeStoredVideoDuration/);
  assert.match(upload, /const durationSeconds = probedDurationSeconds \|\| suppliedDurationSeconds \|\| 0/);
  assert.match(upload, /eq\(lessonsDb\.courseSlug, courseSlug\)/);
  assert.match(upload, /if \(!existingLesson\)/);
  assert.match(upload, /if \(!linked\) throw new Error\("lesson-link-failed"\)/);
  assert.match(upload, /durationSeconds: videoAssets\.durationSeconds/);
  assert.match(upload, /isNativeAppRequest\(request\)/);
  assert.match(upload, /pg_advisory_xact_lock\(hashtext\([\s\S]*video-upload:/);
  assert.ok(upload.indexOf("pg_advisory_xact_lock") < upload.indexOf("const previous"));
  assert.ok(upload.indexOf("replacedAssets.map") > upload.indexOf("db.transaction"));
});
