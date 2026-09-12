import test from "node:test";
import assert from "node:assert/strict";
import * as orm from "drizzle-orm";
import { pgTable, text, integer, PgDialect } from "drizzle-orm/pg-core";
import { isolated } from "./helpers/business-fixtures.mjs";

const tables = Object.fromEntries([
  ["courseRequestFiles", "request"], ["supportReplyFiles", "support"],
  ["courseResources", "resource"], ["aiFiles", "ai"],
].map(([variable, name]) => [variable, pgTable(name, {
  id: integer("id"), objectKey: text("object_key"), originalName: text("original_name"),
  sizeBytes: integer("size_bytes"), scanStatus: text("scan_status"),
  scanAttempts: integer("scan_attempts"), scanLastAttemptAt: text("scan_last_attempt_at"),
  scanNextAttemptAt: text("scan_next_attempt_at"), createdAt: text("created_at"),
})]));
const key = column => column.name.replace(/_([a-z])/g, (_, character) => character.toUpperCase());
const compile = value => new PgDialect().sqlToQuery(value.actual);
const clauses = {
  eq: (column, value) => ({ kind: "eq", column, value, actual: orm.eq(column, value) }),
  isNull: column => ({ kind: "isNull", column, actual: orm.isNull(column) }),
  lte: (column, value) => ({ kind: "lte", column, value, actual: orm.lte(column, value) }),
  and: (...values) => ({ kind: "and", values, actual: orm.and(...values.map(value => value.actual)) }),
  or: (...values) => ({ kind: "or", values, actual: orm.or(...values.map(value => value.actual)) }),
  asc: column => ({ kind: "asc", column, actual: orm.asc(column) }),
  sql: (strings, ...values) => ({ kind: "nullsFirst", column: values[0], actual: orm.sql(strings, ...values) }),
  count: orm.count,
};
function matches(row, clause) {
  if (clause.kind === "and") return clause.values.every(value => matches(row, value));
  if (clause.kind === "or") return clause.values.some(value => matches(row, value));
  if (clause.kind === "eq") return row[key(clause.column)] === clause.value;
  if (clause.kind === "isNull") return row[key(clause.column)] == null;
  if (clause.kind === "lte") return row[key(clause.column)] != null && row[key(clause.column)] <= clause.value;
  throw new Error("Unsupported predicate " + clause.kind);
}
function row(id, overrides = {}) {
  return { id, objectKey: "synthetic/" + id, originalName: "synthetic.pdf", sizeBytes: 12, scanStatus: "pending",
    scanAttempts: 0, scanLastAttemptAt: null, scanNextAttemptAt: null, createdAt: "2020-01-01T00:00:00.000Z", ...overrides };
}
const verdict = status => ({ status, provider: "clamav", error: null, sha256: status === "pending" ? null : "a".repeat(64), scannedAt: new Date().toISOString(), quarantineReason: status === "quarantined" ? "Synthetic-threat" : null });
async function queueFixture(initial = {}, options = {}) {
  const rows = Object.fromEntries(["request", "support", "resource", "ai"].map(source => [source, structuredClone(initial[source] || [])]));
  const calls = { selects: [], writes: [], scans: [], locks: [], releases: [] };
  let updateCount = 0;
  const db = {
    select() {
      return { from(table) {
        const source = orm.getTableName(table);
        let predicate, ordering = [], take = Infinity;
        const query = {
          where(value) { predicate = value; return query; },
          orderBy(...values) { ordering = values; return query; },
          limit(value) { take = value; return query; },
          then(resolve, reject) {
            return Promise.resolve().then(() => {
              calls.selects.push({ source, predicate: compile(predicate), ordering: ordering.map(compile), take });
              return rows[source].filter(value => matches(value, predicate)).sort((a, b) => {
                for (const order of ordering) {
                  const name = key(order.column), left = a[name], right = b[name];
                  if (left == null || right == null) {
                    if (left == null && right != null) return -1;
                    if (left != null && right == null) return 1;
                  }
                  if (left < right) return -1;
                  if (left > right) return 1;
                }
                return 0;
              }).slice(0, take).map(value => ({ ...value }));
            }).then(resolve, reject);
          },
        };
        return query;
      } };
    },
    update(table) {
      const source = orm.getTableName(table);
      return { set(values) { return { where(predicate) { return { async returning() {
        updateCount++;
        await options.beforeWrite?.({ source, values, rows, updateCount });
        const selected = rows[source].filter(value => matches(value, predicate));
        calls.writes.push({ source, values, predicate: compile(predicate), affected: selected.length });
        for (const value of selected) Object.assign(value, values);
        return selected.map(value => ({ id: value.id }));
      } }; } }; } };
    },
  };
  const queue = await isolated("../lib/file-scan-queue.ts", {
    ...tables, ...clauses, getDb: () => db,
    getPool: () => ({ connect: async () => ({
      query: async (query, parameters) => { calls.locks.push({ query, parameters }); return { rows: [{ locked: options.locked !== false }] }; },
      release: discard => calls.releases.push(discard),
    }) }),
    scannerConfigured: () => options.configured !== false,
    scannerConfigurationError: () => options.configured === false ? "scanner_not_configured" : null,
    scanStoredFile: async value => { calls.scans.push({ ...value }); return options.scan ? options.scan(value, rows) : verdict("clean"); },
    scanColumns: result => ({ scanStatus: result.status, scanError: result.error, scanSha256: result.sha256 }),
  });
  return { queue, rows, calls };
}

test("manual retry selects the requested source and id despite older backlog and future backoff", async () => {
  const fixture = await queueFixture({
    request: Array.from({ length: 25 }, (_, index) => row(index + 1)),
    support: [row(40), row(999, { objectKey: "synthetic/target-only", scanNextAttemptAt: "2099-01-01T00:00:00.000Z" })],
  });
  const result = await fixture.queue.runFileScanBatch(1, { source: "support", id: 999 });
  assert.equal(result.scanned, 1);
  assert.equal(result.clean, 1);
  assert.deepEqual(result.results, [{ source: "support", id: 999, status: "clean", error: null }]);
  assert.deepEqual(fixture.calls.scans.map(value => value.objectKey), ["synthetic/target-only"]);
  assert.deepEqual(fixture.calls.selects.map(value => value.source), ["support"]);
  const predicate = fixture.calls.selects[0].predicate;
  assert.match(predicate.sql, /"support"\."id" = \$\d+/);
  assert.deepEqual(predicate.params, ["pending", 999]);
  assert.doesNotMatch(predicate.sql, /scan_next_attempt_at/);
  assert.equal(fixture.rows.request.every(value => value.scanAttempts === 0), true);
});

test("automatic scans prioritize never-attempted files before old failures, within and across sources", async () => {
  const attempted = { scanLastAttemptAt: "2026-01-01T00:00:00.000Z", scanAttempts: 5, createdAt: "2010-01-01T00:00:00.000Z" };
  const fixture = await queueFixture({
    request: [row(1, attempted), row(2, { createdAt: "2020-02-01T00:00:00.000Z" })],
    support: [row(3, attempted)],
    ai: [row(4, { scanNextAttemptAt: "2099-01-01T00:00:00.000Z", createdAt: "2000-01-01T00:00:00.000Z" })],
    resource: [row(5, { createdAt: "2020-03-01T00:00:00.000Z" })],
  });
  const result = await fixture.queue.runFileScanBatch(1);
  assert.deepEqual(result.results.map(value => [value.source, value.id]), [["request", 2]]);
  for (const selection of fixture.calls.selects) {
    assert.match(selection.ordering[0].sql, /"scan_last_attempt_at" asc nulls first/);
    assert.match(selection.predicate.sql, /"scan_next_attempt_at" is null/i);
    assert.match(selection.predicate.sql, /"scan_next_attempt_at" <= \$\d+/);
  }
  const second = await fixture.queue.runFileScanBatch(1);
  assert.deepEqual(second.results.map(value => [value.source, value.id]), [["resource", 5]]);
  assert.equal(fixture.rows.ai[0].scanAttempts, 0);
});

test("busy advisory lock returns an honest empty summary and never scans or unlocks another owner", async () => {
  const fixture = await queueFixture({ request: [row(1)] }, { locked: false });
  const summary = await fixture.queue.runFileScanBatch(1, { source: "request", id: 1 });
  assert.equal(summary.busy, true);
  assert.equal(summary.clean, 0);
  assert.equal(summary.scanned, 0);
  assert.deepEqual(summary.results, []);
  assert.equal(fixture.calls.selects.length, 0);
  assert.equal(fixture.calls.scans.length, 0);
  assert.equal(fixture.calls.locks.length, 1);
  assert.match(fixture.calls.locks[0].query, /pg_try_advisory_lock/);
  assert.deepEqual(fixture.calls.releases, [false]);
});

test("a row changed before claim is skipped without scanning or counting it as clean", async () => {
  const fixture = await queueFixture({ request: [row(1)] }, {
    beforeWrite: ({ rows, updateCount }) => { if (updateCount === 1) rows.request[0].scanStatus = "quarantined"; },
  });
  const summary = await fixture.queue.runFileScanBatch(1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.scanned, 0);
  assert.equal(summary.clean, 0);
  assert.deepEqual(summary.results, []);
  assert.equal(fixture.calls.scans.length, 0);
  assert.equal(fixture.rows.request[0].scanStatus, "quarantined");
  assert.deepEqual(fixture.calls.writes[0].predicate.params, [1, "synthetic/1", "pending"]);
});

test("a row deleted or quarantined during scanning cannot produce a false persisted success", async t => {
  for (const mutate of [
    rows => { rows.support = []; },
    rows => { rows.support[0].scanStatus = "quarantined"; },
    rows => { rows.support[0].objectKey = "synthetic/replaced-file"; },
  ]) {
    await t.test("concurrent persistence change", async () => {
      const fixture = await queueFixture({ support: [row(1)] }, { scan: async (_value, rows) => { mutate(rows); return verdict("clean"); } });
      const summary = await fixture.queue.runFileScanBatch(1, { source: "support", id: 1 });
      assert.equal(summary.skipped, 1);
      assert.equal(summary.scanned, 0);
      assert.equal(summary.clean, 0);
      assert.deepEqual(summary.results, []);
      assert.equal(fixture.calls.scans.length, 1);
      assert.equal(fixture.calls.writes.at(-1).affected, 0);
    });
  }
});

test("quarantined files stay quarantined through retry and targeted batch selection", async () => {
  const fixture = await queueFixture({ request: [row(9, { scanStatus: "quarantined", scanNextAttemptAt: "2099-01-01T00:00:00.000Z" })] });
  assert.equal(await fixture.queue.retryFileScan("request", 9), false);
  assert.equal((await fixture.queue.runFileScanBatch(1, { source: "request", id: 9 })).scanned, 0);
  assert.equal(fixture.rows.request[0].scanStatus, "quarantined");
  assert.equal(fixture.rows.request[0].scanNextAttemptAt, "2099-01-01T00:00:00.000Z");
  assert.equal(fixture.calls.scans.length, 0);
});

class MfaError extends Error { constructor() { super("Step-up required"); this.status = 403; this.code = "mfa_required"; } }
async function routeFixture(overrides = {}) {
  const calls = { stepUp: 0, check: 0, retry: [], batch: [], audit: [], overview: 0 };
  const baseSummary = { scanned: 1, clean: 1, pending: 0, quarantined: 0, skipped: 0, busy: false, configured: true, results: [] };
  const route = await isolated("../app/api/admin/files/scan/route.ts", {
    getSessionUser: async () => ({ id: 7, role: "admin", email: "admin@example.test" }),
    roleAllowed: (user, roles) => roles.includes(user?.role), sameOriginRequest: () => true,
    isScheduledTaskRequest: () => false, checkRateLimit: async () => true, clientIp: () => "127.0.0.1",
    jsonError: (error, status = 400, code) => Response.json({ error, code }, { status }),
    readBoundedJsonObject: request => request.json(), observeRequest: (_request, _name, action) => action(),
    requireAdminStepUp: async () => { calls.stepUp++; }, AdminMfaError: MfaError,
    checkScannerConnection: async () => { calls.check++; return { ok: true, code: "scanner_ready" }; },
    fileScanOverview: async () => { calls.overview++; return { configured: true, groups: [] }; },
    retryFileScan: async (source, id) => { calls.retry.push({ source, id }); return true; },
    runFileScanBatch: async (...args) => { calls.batch.push(args); return baseSummary; },
    auditLogs: {}, getDb: () => ({ insert: () => ({ values: async value => calls.audit.push(value) }) }),
    ...overrides,
  });
  const request = payload => new Request("https://maras.example.test/api/admin/files/scan", { method: "POST", headers: { origin: "https://maras.example.test", "content-type": "application/json" }, body: JSON.stringify(payload) });
  return { route, calls, request };
}

test("admin retry API executes the exact requested file with step-up and an audit entry", async () => {
  const fixture = await routeFixture();
  const response = await fixture.route.POST(fixture.request({ action: "retry", source: "ai", id: "123" }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.queued, false);
  assert.equal(fixture.calls.stepUp, 1);
  assert.deepEqual(fixture.calls.retry, [{ source: "ai", id: 123 }]);
  assert.deepEqual(fixture.calls.batch, [[1, { source: "ai", id: 123 }]]);
  assert.equal(fixture.calls.audit.length, 1);
  assert.equal(fixture.calls.audit[0].entityId, "123");
  assert.equal(fixture.calls.audit[0].entityType, "ai_file");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("admin connection check and overview need an admin session but no step-up", async () => {
  const fixture = await routeFixture({ requireAdminStepUp: async () => { throw new Error("Read-only diagnostics must not require step-up"); } });
  const response = await fixture.route.POST(fixture.request({ action: "check" }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).connection.ok, true);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(fixture.calls.check, 1);
  assert.deepEqual(fixture.calls.batch, []);
  assert.deepEqual(fixture.calls.audit, []);
  assert.equal((await fixture.route.GET(new Request("https://maras.example.test/api/admin/files/scan"))).status, 200);
  assert.equal(fixture.calls.overview, 1);
});

test("student, anonymous, and foreign-origin requests cannot run even read-only connection diagnostics", async () => {
  for (const overrides of [
    { getSessionUser: async () => ({ id: 1, role: "student" }) },
    { getSessionUser: async () => null },
    { sameOriginRequest: () => false },
  ]) {
    const fixture = await routeFixture(overrides);
    assert.equal((await fixture.route.POST(fixture.request({ action: "check" }))).status, 403);
    assert.equal((await fixture.route.POST(fixture.request({ action: "retry", source: "request", id: 1 }))).status, 403);
    assert.equal(fixture.calls.check, 0);
    assert.equal(fixture.calls.stepUp, 0);
    assert.deepEqual(fixture.calls.retry, []);
    assert.deepEqual(fixture.calls.batch, []);
    assert.deepEqual(fixture.calls.audit, []);
  }
});

test("retry API reports queued while scanner is busy and rejects files no longer pending", async () => {
  const busy = await routeFixture({ runFileScanBatch: async () => ({ configured: true, busy: true, scanned: 0, clean: 0, results: [] }) });
  const response = await busy.route.POST(busy.request({ action: "retry", source: "request", id: 1 }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.queued, true);
  assert.equal(payload.summary.clean, 0);
  const quarantined = await routeFixture({ retryFileScan: async () => false });
  assert.equal((await quarantined.route.POST(quarantined.request({ action: "retry", source: "request", id: 2 }))).status, 409);
  assert.deepEqual(quarantined.calls.batch, []);
  assert.deepEqual(quarantined.calls.audit, []);
});

test("retry mutation remains blocked without step-up and invalid ids never reach persistence", async () => {
  const denied = await routeFixture({ requireAdminStepUp: async () => { throw new MfaError(); } });
  assert.equal((await denied.route.POST(denied.request({ action: "retry", source: "request", id: 1 }))).status, 403);
  assert.deepEqual(denied.calls.retry, []);
  for (const id of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1x"]) {
    const fixture = await routeFixture();
    assert.equal((await fixture.route.POST(fixture.request({ action: "retry", source: "request", id }))).status, 400);
    assert.deepEqual(fixture.calls.retry, []);
  }
});
