import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const bootstrap = fileURLToPath(new URL("../scripts/tsx-runtime-bootstrap.cjs", import.meta.url));

function runSecurityScenario(source) {
  const result = spawnSync(process.execPath, ["--require", bootstrap, "--import", "tsx", "--input-type=module", "--eval", source], { cwd: root, encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("request limits count received bytes and cancel oversized chunked or misleading bodies", () => {
  runSecurityScenario(`
    import assert from "node:assert/strict";
    const { boundedRequestBody, RequestBodyTooLargeError } = await import("./lib/request-body.ts");
    for (const headers of [{}, { "content-length": "1" }]) {
      let cancelled = false;
      const stream = new ReadableStream({
        pull(controller) { controller.enqueue(new Uint8Array(8)); },
        cancel() { cancelled = true; },
      });
      const request = new Request("https://meras.test/upload", { method: "POST", body: stream, duplex: "half", headers });
      await assert.rejects(new Response(boundedRequestBody(request, 12)).arrayBuffer(), RequestBodyTooLargeError);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(cancelled, true);
    }
    const tooLarge = new Request("https://meras.test", { method: "POST", headers: { "content-length": "50" }, body: "x" });
    assert.throws(() => boundedRequestBody(tooLarge, 12), RequestBodyTooLargeError);
    const exact = new Request("https://meras.test", { method: "POST", body: "123456789012" });
    assert.equal(await new Response(boundedRequestBody(exact, 12)).text(), "123456789012");
  `);
});

test("bounded form uploads retain fields and files while rejecting oversized multipart data", () => {
  runSecurityScenario(`
    import assert from "node:assert/strict";
    const { readBoundedFormData, RequestBodyTooLargeError } = await import("./lib/request-body.ts");
    const form = new FormData();
    form.set("name", "شريك مراس");
    form.set("file", new File(["image-bytes"], "logo.png", { type: "image/png" }));
    const good = await readBoundedFormData(new Request("https://meras.test", { method: "POST", body: form }), 2048);
    assert.equal(good.get("name"), "شريك مراس");
    assert.equal(await good.get("file").text(), "image-bytes");
    assert.equal(good.get("file").name, "logo.png");
    await assert.rejects(readBoundedFormData(new Request("https://meras.test", { method: "POST", body: form }), 32), RequestBodyTooLargeError);
  `);
});

test("account JSON rejects null, arrays, broken JSON and bodies larger than the limit", () => {
  runSecurityScenario(`
    import assert from "node:assert/strict";
    const { readBoundedJsonObject, RequestBodyTooLargeError } = await import("./lib/request-body.ts");
    const request = body => new Request("https://meras.test", { method: "POST", body });
    assert.deepEqual(await readBoundedJsonObject(request('{"email":"student@example.test"}')), { email: "student@example.test" });
    for (const body of ["null", "[]", '"text"', "{"]) await assert.rejects(readBoundedJsonObject(request(body)));
    await assert.rejects(readBoundedJsonObject(request(JSON.stringify({ x: "x".repeat(20_000) }))), RequestBodyTooLargeError);
  `);
});

test("malformed session and referral cookies fail closed and production logout clears a secure cookie", () => {
  runSecurityScenario(`
    import assert from "node:assert/strict";
    import { register } from "node:module";
    register("data:text/javascript," + encodeURIComponent('export async function resolve(specifier, context, next) { if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true }; return next(specifier, context); }'), import.meta.url);
    const auth = await import("./lib/auth.ts");
    const referrals = await import("./lib/referrals.ts");
    const malformed = new Request("https://meras.test", { headers: { cookie: "meras_session=%E0%A4%A; meras_referral=%" } });
    assert.equal(auth.requestSessionToken(malformed), "");
    assert.equal(await auth.getSessionUser(malformed), null);
    assert.equal(referrals.referralCodeFromRegistration({}, malformed), "");
    const bearer = "a".repeat(43);
    assert.equal(auth.requestSessionToken(new Request("https://meras.test", { headers: { cookie: "meras_session=%", authorization: "Bearer " + bearer } })), bearer);
    process.env.NODE_ENV = "production";
    process.env.SESSION_COOKIE_SECURE = "false";
    const cookie = await auth.revokeSession(new Request("http://internal:8080", { method: "POST" }));
    assert.match(cookie, /; Secure;/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Max-Age=0/);
  `);
});
test("interrupted multipart uploads reject cleanly and remove completed and partial files", () => {
  runSecurityScenario(`
    import assert from "node:assert/strict";
    import { mkdtemp, rm } from "node:fs/promises";
    import { tmpdir } from "node:os";
    import { join } from "node:path";
    const directory = await mkdtemp(join(tmpdir(), "meras-upload-test-"));
    process.env.UPLOAD_DIR = directory;
    delete process.env.S3_ENDPOINT;
    const { parseStoredMultipart, deleteStoredMultipartFiles } = await import("./lib/multipart-upload.ts");
    const { listLocalFiles } = await import("./lib/storage.ts");
    const options = { maxFiles: 3, maxFileBytes: 1024, maxTotalBytes: 3072, objectPrefix: "course-files", allowedTypes: new Set(["text/plain"]), validSignature: () => true };
    try {
      const form = new FormData();
      form.set("files", new File(["lesson"], "lesson.txt", { type: "text/plain" }));
      const saved = await parseStoredMultipart(new Request("https://meras.test", { method: "POST", body: form }), options);
      assert.equal(saved.files.length, 1);
      assert.equal(saved.files[0].sizeBytes, 6);
      await deleteStoredMultipartFiles(saved.files);
      for (const secondType of ["text/plain", "application/x-rejected"]) {
        const body = [
          "--upload", 'Content-Disposition: form-data; name="files"; filename="first.txt"', "Content-Type: text/plain", "", "first",
          "--upload", 'Content-Disposition: form-data; name="files"; filename="second.txt"', "Content-Type: " + secondType, "", "unfinished",
        ].join(String.fromCharCode(13, 10));
        await assert.rejects(parseStoredMultipart(new Request("https://meras.test", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=upload" }, body }), options));
        assert.deepEqual(await listLocalFiles(directory), [], "interrupted upload left an object or a temporary file");
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  `);
});
