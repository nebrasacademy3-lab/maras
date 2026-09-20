import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import test from "node:test";
import { isolated, sql, eq, or, and, tables, database } from "./helpers/business-fixtures.mjs";
for (const name of ["instructorProfiles", "instructorDocuments", "storageCleanupJobs"]) tables[name] = new Proxy({ _name: name }, { get(target, key) { return key === "_name" ? target._name : { table: name, key }; } });
const cryptography = Object.fromEntries(Object.entries(crypto).filter(([key]) => key !== "default"));
const policy = await isolated("../lib/instructor-policy.ts");
const requestBody = await isolated("../lib/request-body.ts");
const api = await isolated("../lib/api.ts");
class AdminMfaError extends Error { constructor() { super("MFA required"); this.status = 403; this.code = "MFA_REQUIRED"; } }
class DeviceLimitError extends Error {}
const fullUser = { id: 9, fullName: "Synthetic Instructor", email: "instructor@example.test", phone: "+966512345678", role: "instructor", status: "active", emailVerified: true, emailVerifiedAt: "2026-01-01" };
const profileInput = { country: "SA", gender: "male", qualification: "bachelor", specialty: "Mathematics", address: "Synthetic private address", bio: "I have years of mathematics teaching experience.", teachingSubjects: "Calculus and algebra", compensationModel: "hourly" };
async function fixture(options = {}) {
 let actor = options.actor === undefined ? fullUser : options.actor;
 const env = { INSTRUCTOR_DATA_ENCRYPTION_KEY: "31".repeat(32), INSTRUCTOR_IDENTITY_LEGAL_BASIS: "Synthetic documented test basis only", INSTRUCTOR_IDENTITY_RETENTION_DAYS: "30", ...options.env };
 const stored = new Map(); const calls = { put: 0, get: 0, scan: 0, delete: 0, session: 0, verification: 0, stepUp: 0 };
 const security = await isolated("../lib/instructor-security.ts", { ...cryptography, process: { env }, getSessionUser: async () => actor, requireAdminStepUp: async () => { calls.stepUp++; if (options.stepUp === false) throw new AdminMfaError(); } });
 const initialProfile = { userId: 9, ...profileInput, addressEncrypted: security.encryptInstructorData(profileInput.address, "address:9"), status: "draft", revision: 1, createdAt: "2026-01-01", ...options.profile };
 delete initialProfile.address;
 const db = database({ users: [{ ...fullUser, ...options.account }], instructorProfiles: [initialProfile], instructorDocuments: options.documents || [] });
 const sameOriginRequest = request => request.headers.get("origin") === new URL(request.url).origin;
 const mobile = await isolated("../lib/mobile-api.ts", { sameOriginRequest });
 const onboarding = await isolated("../lib/instructor-onboarding.ts", { ...tables, ...api, ...security, ...policy, ...mobile, ...requestBody, AdminMfaError, sql, eq, sameOriginRequest });
 const fileSecurity = await isolated("../lib/file-security.ts", { ...cryptography });
 const dependencies = { ...tables, ...api, ...security, ...policy, ...mobile, ...requestBody, ...onboarding, ...cryptography, DeviceLimitError,
  sql, eq, and, or, desc: column => column, getDb: () => db, getSessionUser: async () => actor, sameOriginRequest,
  checkRateLimit: async () => true, clientIp: () => "synthetic", validEmail: value => /^[^@]+@[^@]+\.[^@]+$/.test(value), validPassword: value => value.length >= 10,
  hashPassword: async () => "synthetic-hash", sessionUserFromRow: row => ({ id: row.id, role: row.role }),
  createSession: async () => { calls.session++; return { token: "synthetic-token", expiresAt: "2027-01-01", cookie: "session=synthetic", deviceCookie: "device=synthetic" }; },
  ensureVerificationEmail: async () => { calls.verification++; return { ok: true }; },
  readScanBytes: fileSecurity.readScanBytes,
  scanBuffer: async bytes => { calls.scan++; return { status: options.scanStatus || "clean", sha256: crypto.createHash("sha256").update(bytes).digest("hex") }; },
  activeStorageProvider: () => "local",
  enqueueStorageCleanupTx: async (tx, targets) => { const ids = []; for (const target of targets) { const id = crypto.randomUUID(); await tx.insert(tables.storageCleanupJobs).values({ id, objectKey: target.key, provider: target.provider, source: target.source, status: "pending" }); ids.push(id); } return ids; },
  putObject: async (key, stream) => { calls.put++; stored.set(key, Buffer.from(await new Response(stream).arrayBuffer())); return { key, provider: "local" }; },
  getObject: async key => { calls.get++; const bytes = stored.get(key); return bytes ? { body: new Response(new Uint8Array(bytes)).body, size: bytes.length } : null; },
  deleteObject: async key => { calls.delete++; if (options.deleteFails) throw new Error("Synthetic unavailable"); stored.delete(key); },
 };
 const routes = {};
 for (const name of ["register", "profile", "documents", "documents/[id]"]) routes[name] = await isolated("../app/api/instructor/" + name + "/route.ts", dependencies);
 return { ...dependencies, routes, db, calls, stored, env, setActor: value => { actor = value; } };
}
function jsonRequest(path, value, extra = {}) { return new Request("https://example.test/api/instructor/" + path, { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json", ...extra }, body: JSON.stringify(value) }); }
const png = Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]);
function upload(kind = "selfie", revision = 1, extra = {}) { const form = new FormData(); form.set("file", new File([png], "private.png", { type: "image/png" })); form.set("kind", kind); form.set("expectedRevision", String(revision)); form.set("captureSource", "camera"); for (const [key,value] of Object.entries(extra)) form.set(key,value); return new Request("https://example.test/api/instructor/documents", { method: "POST", headers: { origin: "https://example.test" }, body: form }); }
const context = id => ({ params: Promise.resolve({ id: String(id) }) });

test("instructor data encryption binds purpose and owner and rejects ciphertext substitution", async () => {
 const f = await fixture();
 const value = f.encryptInstructorData("private", "address:9");
 assert.equal(f.decryptInstructorData(value, "address:9"), "private");
 assert.throws(() => f.decryptInstructorData(value, "address:10"), /سلامة/);
 assert.throws(() => f.decryptInstructorData(value, "bank:9"), /سلامة/);
});
test("registration fixes role to instructor, records consent, encrypts address and sends verification", async () => {
 const f = await fixture();
 const response = await f.routes.register.POST(jsonRequest("register", { ...profileInput, fullName: "New Instructor Name", email: "new@example.test", phone: "+201012345678", password: "Synthetic!12345", role: "admin", status: "approved", termsAccepted: true, privacyAccepted: true }));
 assert.equal(response.status, 201);
 const payload = await response.json();
 assert.equal(payload.user.role, "instructor"); assert.equal(payload.token, undefined); assert.equal(payload.next, "/verify-email?return_to=%2Finstructor");
 assert.ok(response.headers.get("set-cookie"));
 const created = f.db.rows.instructorProfiles.at(-1);
 assert.equal(created.status, "draft"); assert.notEqual(created.addressEncrypted, profileInput.address);
 assert.equal(f.decryptInstructorData(created.addressEncrypted, "address:" + created.userId), profileInput.address);
 assert.equal(f.calls.session, 1); assert.equal(f.calls.verification, 1);
});
test("native registration returns token only for native requests without browser fetch metadata", async () => {
 const f = await fixture();
 const body = { ...profileInput, fullName: "New Instructor Name", email: "new@example.test", phone: "+201012345678", password: "Synthetic!12345", termsAccepted: true, privacyAccepted: true };
 const request = new Request("https://example.test/api/instructor/register", { method: "POST", headers: { "x-meras-client": "mobile-v1", "x-meras-platform": "android" }, body: JSON.stringify(body) });
 const response = await f.routes.register.POST(request);
 assert.equal(response.status, 201); assert.equal((await response.json()).token, "synthetic-token"); assert.equal(response.headers.has("set-cookie"), false);
 const spoof = new Request("https://example.test/api/instructor/register", { method: "POST", headers: { "x-meras-client": "mobile-v1", "x-meras-platform": "android", origin: "https://evil.test", "sec-fetch-mode": "cors" }, body: JSON.stringify(body) });
 assert.equal((await f.routes.register.POST(spoof)).status, 403);
});
test("unverified accounts, students and supervisors cannot operate instructor profile", async () => {
 for (const actor of [null, { ...fullUser, role: "student" }, { ...fullUser, role: "supervisor" }, { ...fullUser, emailVerified: false }]) {
  const f = await fixture({ actor });
  assert.equal((await f.routes.profile.GET(new Request("https://example.test/api/instructor/profile"))).status, actor ? 403 : 401);
  assert.equal(f.db.writes.length, 0);
 }
});
test("profile updates reject stale revisions, locked applications and revoked accounts", async () => {
 for (const options of [{ profile: { revision: 2 } }, { profile: { status: "submitted" } }, { account: { status: "suspended" } }]) {
  const f = await fixture(options);
  const response = await f.routes.profile.POST(jsonRequest("profile", { ...profileInput, action: "save", expectedRevision: 1 }));
  assert.ok([403,409].includes(response.status)); assert.equal(f.db.writes.length, 0);
 }
});
test("bank account validation rejects invalid IBAN and encrypts valid data without audit disclosure", async () => {
 const f = await fixture();
 const invalid = await f.routes.profile.POST(jsonRequest("profile", { action: "bank", expectedRevision: 1, bank: { accountHolder: fullUser.fullName, bankName: "Test Bank", iban: "SA000" } }));
 assert.equal(invalid.status, 400);
 const bank = { accountHolder: fullUser.fullName, bankName: "Test Bank", iban: "SA0380000000608010167519" };
 const good = await f.routes.profile.POST(jsonRequest("profile", { action: "bank", expectedRevision: 1, bank }));
 assert.equal(good.status, 200);
 assert.deepEqual(JSON.parse(f.decryptInstructorData(f.db.rows.instructorProfiles[0].bankEncrypted, "bank:9")), bank);
 assert.equal(JSON.stringify(f.db.rows.auditLogs).includes(bank.iban), false);
});
test("identity and selfie collection fail closed without a configured basis and retention", async () => {
 const f = await fixture({ env: { INSTRUCTOR_IDENTITY_LEGAL_BASIS: "", INSTRUCTOR_IDENTITY_RETENTION_DAYS: "" } });
 for (const kind of ["selfie", "passport", "identity_front", "identity_back"]) assert.equal((await f.routes.documents.POST(upload(kind))).status, 503);
 assert.equal(f.calls.put, 0); assert.equal(f.db.rows.instructorDocuments.length, 0);
 assert.equal((await f.routes.profile.POST(jsonRequest("profile", { action: "submit", expectedRevision: 1 }))).status, 503);
});
test("uploads require a clean scan and never persist unscanned plaintext", async () => {
 for (const scanStatus of ["pending", "quarantined"]) {
  const f = await fixture({ scanStatus });
  assert.equal((await f.routes.documents.POST(upload())).status, scanStatus === "pending" ? 503 : 422);
  assert.equal(f.calls.put, 0); assert.equal(f.db.rows.instructorDocuments.length, 0);
 }
 const f = await fixture(); const result = await f.routes.documents.POST(upload());
 assert.equal(result.status, 201); assert.equal((await result.json()).revision, 2);
 const row = f.db.rows.instructorDocuments[0];
 assert.equal(f.db.rows.storageCleanupJobs.length, 0, "successful metadata commit cancels staged cleanup atomically");
 assert.equal(row.scanStatus, "clean"); assert.ok(row.expiresAt); assert.ok(row.identityLegalBasis);
 const encrypted = f.stored.get(row.objectKey).toString("utf8");
 assert.notEqual(encrypted, png.toString("base64"));
 assert.equal(f.decryptInstructorData(encrypted, f.instructorDocumentContext(9, row.objectKey)), png.toString("base64"));
});
test("selfie source, file signatures and stale upload revisions reject unsafe documents", async () => {
 const f = await fixture();
 assert.equal((await f.routes.documents.POST(upload("selfie", 1, { captureSource: "gallery" }))).status, 400);
 assert.throws(() => f.instructorFileType("selfie", Buffer.from("%PDF-1.7")), /PNG/);
 assert.throws(() => f.instructorFileType("cv", Buffer.from("<script>bad</script>")), /PNG/);
 assert.equal((await f.routes.documents.POST(upload("selfie", 99))).status, 409);
 assert.equal(f.stored.size, 0, "failed metadata transaction cleans encrypted staging object");
 assert.equal(f.db.rows.instructorDocuments.length, 0);
});
test("document download enforces owner, admin step-up, expiry and authenticated bytes", async () => {
 const f = await fixture(); await f.routes.documents.POST(upload());
 const row = f.db.rows.instructorDocuments[0];
 const request = new Request("https://example.test/api/instructor/documents/1");
 f.setActor({ ...fullUser, id: 10 });
 assert.equal((await f.routes["documents/[id]"].GET(request, context(row.id))).status, 404); assert.equal(f.calls.get, 0);
 f.setActor(fullUser);
 const download = await f.routes["documents/[id]"].GET(request, context(row.id));
 assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
 assert.match(download.headers.get("content-disposition"), /^attachment/);
 row.expiresAt = "2000-01-01";
 assert.equal((await f.routes["documents/[id]"].GET(request, context(row.id))).status, 410);
});
test("application submission requires clean current selfie and complete identity documents", async () => {
 const f = await fixture();
 assert.equal((await f.routes.profile.POST(jsonRequest("profile", { action: "submit", expectedRevision: 1 }))).status, 400);
 await f.routes.documents.POST(upload("selfie", 1)); await f.routes.documents.POST(upload("passport", 2));
 const response = await f.routes.profile.POST(jsonRequest("profile", { action: "submit", expectedRevision: 3 }));
 assert.equal(response.status, 200); assert.equal(f.db.rows.instructorProfiles[0].status, "submitted");
 assert.equal((await f.routes.documents.POST(upload("certificate", 4))).status, 409);
});
test("failed private-object deletion leaves the document record and revision for retry", async () => {
 const f = await fixture({ deleteFails: true }); await f.routes.documents.POST(upload());
 const request = new Request("https://example.test/api/instructor/documents/1", { method: "DELETE", headers: { origin: "https://example.test" }, body: JSON.stringify({ expectedRevision: 2 }) });
 assert.equal((await f.routes["documents/[id]"].DELETE(request, context(1))).status, 503);
 assert.equal(f.db.rows.instructorDocuments.length, 1); assert.equal(f.db.rows.instructorProfiles[0].revision, 2);
});


test("only the owner administrator with step-up may retrieve another instructor document", async () => {
 for (const [actor, stepUp, expected] of [[{ ...fullUser, id: 2, role: "admin", isPlatformOwner: false }, true, 403], [{ ...fullUser, id: 2, role: "admin", isPlatformOwner: true }, false, 403], [{ ...fullUser, id: 2, role: "admin", isPlatformOwner: true }, true, 200]]) {
  const f = await fixture({ stepUp }); await f.routes.documents.POST(upload()); f.setActor(actor);
  const response = await f.routes["documents/[id]"].GET(new Request("https://example.test/api/instructor/documents/1"), context(1));
  assert.equal(response.status, expected); if (expected !== 200) assert.equal(f.calls.get, 0);
 }
});
test("tampered encrypted document never returns bytes to the client", async () => {
 const f = await fixture(); await f.routes.documents.POST(upload());
 const row = f.db.rows.instructorDocuments[0], envelope = f.stored.get(row.objectKey).toString("utf8").split(".");
 envelope[2] = (envelope[2][0] === "A" ? "B" : "A") + envelope[2].slice(1);
 f.stored.set(row.objectKey, Buffer.from(envelope.join(".")));
 const response = await f.routes["documents/[id]"].GET(new Request("https://example.test/api/instructor/documents/1"), context(1));
 assert.equal(response.status, 503); assert.equal((await response.json()).code, "INSTRUCTOR_DATA_UNAVAILABLE");
});

 test("failed document commit retains durable cleanup even when immediate storage deletion fails", async () => {
 const f = await fixture({ deleteFails: true });
 assert.equal((await f.routes.documents.POST(upload("selfie", 99))).status, 409);
 assert.equal(f.db.rows.instructorDocuments.length, 0); assert.equal(f.stored.size, 1);
 const [job] = f.db.rows.storageCleanupJobs; assert.equal(job.status, "pending"); assert.equal(job.source, "instructor-document-staging"); assert.equal(job.provider, "local"); assert.ok(f.stored.has(job.objectKey)); assert.ok(job.availableAt.getTime() > Date.now());
 });
