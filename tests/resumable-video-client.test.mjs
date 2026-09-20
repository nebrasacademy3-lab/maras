import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { nativeSource } from "./helpers/native-source.mjs";
const policy = await nativeSource("lib/resumable-upload-policy.ts");
const { UploadError } = await nativeSource("lib/upload-client.ts");
function fixture() {
  const memory = new Map(), sessions = new Map(), starts = [], parts = [];
  let actor = 10, failPart = null, lostCompletion = false, denied = false, completions = 0;
  const localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
  const adminFetch = async (url, options) => {
    if (url === "/api/admin/me") return Response.json({ user: { id: actor } });
    const body = JSON.parse(options.body);
    if (denied || actor !== body.ownerId) return Response.json({ error: "Denied" }, { status: 403 });
    if (body.action === "start") {
      starts.push(body);
      let row = sessions.get(`${actor}:${body.requestKey}`);
      if (!row) { row = { id: randomUUID(), status: "open", received: [], sizeBytes: body.sizeBytes, chunkBytes: policy.RESUMABLE_CHUNK_BYTES, expiresAt: new Date(Date.now() + 60000).toISOString() }; sessions.set(`${actor}:${body.requestKey}`, row); }
      return Response.json(row);
    }
    const row = [...sessions.values()].find(row => row.id === body.id);
    assert.ok(row); if (row.status !== "completed") { completions++; row.status = "completed"; row.asset = { id: 11 }; }
    if (lostCompletion) { lostCompletion = false; throw new UploadError("Response lost", 0); }
    return Response.json(row);
  };
  const uploadWithProgress = async options => {
    const params = new URL(options.url, "https://maras-qa.example").searchParams, index = Number(params.get("part"));
    const row = [...sessions.values()].find(row => row.id === params.get("id")); assert.ok(row);
    assert.equal(options.headers["x-meras-acting-user"], String(actor)); assert.equal(options.withCredentials, true);
    parts.push(index); if (index === failPart) throw new UploadError("Network interrupted", 0);
    row.received.push(index); options.onProgress({ loaded: options.body.size }); return structuredClone(row);
  };
  return { memory, starts, parts, sessions, load: () => nativeSource("lib/resumable-video-client.ts", { ...policy, UploadError, adminFetch, uploadWithProgress, localStorage }),
    fail: index => { failPart = index; }, actor: value => { actor = value; }, deny: () => { denied = true; }, loseCompletion: () => { lostCompletion = true; }, completions: () => completions };
}
const bytes = Buffer.alloc(policy.RESUMABLE_CHUNK_BYTES + 12, 2);
const file = new File([bytes], "synthetic.mp4", { type: "video/mp4" });
const options = () => ({ file, courseSlug: "course", lessonId: "lesson", contentType: "video/mp4", signal: new AbortController().signal });
test("browser reload resumes only missing verified parts using the persisted pre-admission request ID", async () => {
  const h = fixture(); h.fail(1);
  await assert.rejects((await h.load()).uploadResumableVideo(options()), /Network interrupted/);
  assert.equal(h.memory.size, 1); for (const value of h.memory.values()) policy.validateUploadId(value);
  h.fail(null); const progress = [];
  const result = await (await h.load()).uploadResumableVideo({ ...options(), onProgress: value => progress.push(value) });
  assert.equal(result.status, "completed"); assert.deepEqual(h.parts, [0, 1, 1]);
  assert.equal(h.starts[0].requestKey, h.starts[1].requestKey); assert.equal(h.completions(), 1);
  assert.equal(progress[0].loaded, policy.RESUMABLE_CHUNK_BYTES); assert.equal(progress.at(-1).percent, 100); assert.equal(h.memory.size, 0);
});
test("lost final acknowledgement reuses the completed session without sending any bytes again", async () => {
  const h = fixture(); h.loseCompletion();
  await assert.rejects((await h.load()).uploadResumableVideo(options()), /Response lost/);
  await (await h.load()).uploadResumableVideo(options());
  assert.deepEqual(h.parts, [0, 1]); assert.equal(h.completions(), 1); assert.equal(h.memory.size, 0);
});
test("same filename and size with changed contents, or another account, cannot reuse a resume marker", async () => {
  const h = fixture(); h.fail(0);
  await assert.rejects((await h.load()).uploadResumableVideo(options()));
  const different = new File([Buffer.alloc(bytes.length, 3)], file.name, { type: file.type });
  await assert.rejects((await h.load()).uploadResumableVideo({ ...options(), file: different }));
  h.actor(20); await assert.rejects((await h.load()).uploadResumableVideo(options()));
  assert.equal(new Set(h.starts.map(row => row.requestKey)).size, 3); assert.equal(h.memory.size, 3);
});
test("revoked authorization and caller cancellation never silently start a replacement upload", async () => {
  const h = fixture(); h.deny(); await assert.rejects((await h.load()).uploadResumableVideo(options()), { status: 403 });
  assert.equal(h.parts.length, 0);
  const signal = AbortSignal.abort(); await assert.rejects((await h.load()).uploadResumableVideo({ ...options(), signal }), { name: "AbortError" });
  assert.equal(h.sessions.size, 0);
});
