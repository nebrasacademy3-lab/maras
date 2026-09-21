# Instructor assignments and private video audit — 2026-09-20

## Implemented

- Owner-only, step-up protected assignment creation/review. Creation requires a real catalog course, approved active instructor and that instructor's currently signed employment contract. One non-cancelled assignment per course is enforced by PostgreSQL and serial admission.
- Own-assignment checks on every detail, edit, upload status, chunk, completion, resource download and preview. Account, application and contract are rechecked. Role, status, video asset IDs, storage keys and publish flags cannot be supplied through lesson editing.
- Optimistic revision checks plus transaction advisory/row locks prevent stale or concurrent changes from overwriting another session. Instructor lock precedes upload row locks; account share locks prevent a suspension racing a content commit.
- Draft units, lessons and video metadata remain in instructor tables/namespaces. Existing resumable upload is reused through a server-owned adapter; payload fields cannot select an adapter or published target. Start leaves revision unchanged; first completed upload increments it once. Processing duration comes from the video worker.
- Private source uploads retain the existing 4 MiB chunks, SHA-256 per-part validation, exact bounds (200 MiB maximum), two open uploads per account, bounded shared admission and final assembly, authenticated storage context and durable cleanup. Every resumed chunk rechecks its still-existing assigned lesson.
- Assignment submission requires at least one lesson per unit, and all assets processed to ready HLS with a positive worker-derived duration. Submitted/published/cancelled tasks block old upload sessions and content changes. Owner may return a submitted task with revision-bound review notes.
- Publication appends new catalog units/lessons atomically. Existing catalog content is preserved. The assignment becomes published, duplicates are rejected/reused, the asset is rebound to its published lesson, and catalog cache is invalidated. Published assets cannot be overwritten through instructor draft upload/deletion.
- Private assigned course resources are limited to active, clean-scanned files in that exact course. Preview verifies both assignment and lesson ownership; HTTP byte ranges and HEAD are supported. Responses are private/no-store and no object keys or direct storage URLs are returned.

## APIs

- `GET /api/instructor/assignments`
- `GET|POST /api/instructor/assignments/:id`; mutations: `saveUnit`, `saveLesson`, `deleteUnit`, `deleteLesson`, `submit`, all with `expectedRevision`.
- `GET|POST|PUT|DELETE /api/instructor/assignments/:id/videos`; JSON start/complete and binary parts follow the existing resumable protocol. Numeric instructor lesson ID is transformed into a private namespace by the server.
- `GET|HEAD /api/instructor/assignments/:id/videos/:lessonId`; authenticated preview.
- `GET /api/instructor/assignments/:id/resources/:resourceId`; authenticated attachment.
- `GET|POST /api/admin/instructors/assignments`; GET `?userId=...`, POST `action:create,userId,courseSlug,contractId,instructions`.
- `POST /api/admin/instructors/assignments/:id`; `action:return_changes|publish|cancel,expectedRevision,reason`.

## Validation

- Real PostgreSQL/local-storage suite: `scripts/qa-instructor-assignments.ts`, seven grouped scenarios passed. Covers concurrent assignment creation and revisions, cross-user and injected data rejection, upload revocation/stale completion, isolation from catalog, HLS readiness, return-changes, append-only/idempotent publication, private metadata and terminated contracts.
- Existing real PostgreSQL resumable suite: nine grouped scenarios passed, including crash/resume, corrupted stored parts, storage relocation, bounded admission, rollback and cleanup. No regressions to admin upload flow.
- HTTP/permission tests plus existing resumable/client/direct-upload tests: 22 passed. Includes platform-owner and step-up checks, source rejection, resource/course scope, scan status, exact video namespace, byte ranges and shared-asset substitution.
- ESLint passed for new assignment routes/libraries and QA script. Full TypeScript at that point found only independently edited mobile-account storage-provider declarations; assignment code compiled.

## Deployment and limits

- Requires migration 0046 and running video/storage-cleanup workers. No new schema beyond the root instructor migration.
- No production data, actual learner orders, money, external providers or real identity documents were used. Tests guard exact loopback `maras_qa` and isolated storage; transport is disabled. Immutable synthetic contract evidence is removed only by a session-scoped cleanup transaction with exact fixture IDs in that guarded QA database.
- The small synthetic video fixture verifies upload isolation and state transitions; it does not claim to prove video transcoding quality. Existing worker/media acceptance and real-device upload/playback remain separate checks.
- Existing 200 MiB per-video limit and shared upload/processing admission are deliberate current operational limits; capacity for hundreds of thousands of concurrent users has not been proven by these tests.

### Follow-up validation

Full TypeScript completed successfully after the independently edited mobile storage declarations were corrected. Instructor student-feature boundary is now explicit and covered by route-level tests; see the onboarding audit for the shared role policy and durable confidential-upload staging cleanup.
