import test from "node:test";
import assert from "node:assert/strict";
import { isolated } from "./helpers/business-fixtures.mjs";

async function fixture({ admins = [], users = [], auditFails = false, passwordValid = true } = {}) {
  const calls = [], hashes = [];
  const state = { users: structuredClone(users), released: false };
  let snapshot;
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql === "BEGIN") { snapshot = structuredClone(state.users); return { rows: [] }; }
      if (sql === "ROLLBACK") { state.users = snapshot; return { rows: [] }; }
      if (sql.includes("WHERE role='admin'")) return { rows: admins };
      if (sql.includes("WHERE lower(email)")) return { rows: state.users.filter(row => row.email.toLowerCase() === values[0]) };
      if (sql.startsWith("INSERT INTO users")) { state.users.push({ id: 42, email: values[0], hash: values[2], role: "admin" }); return { rows: [{ id: 42 }] }; }
      if (sql.startsWith("INSERT INTO audit_logs") && auditFails) throw new Error("audit unavailable");
      return { rows: [] };
    },
    release() { state.released = true; },
  };
  const pool = { async connect() { return client; } };
  const service = await isolated("../scripts/lib/initial-admin.ts", {
    validEmail: email => email === "first-admin@example.test",
    validPassword: () => passwordValid,
    hashPassword: async value => { hashes.push(value); return "test-pbkdf2-hash"; },
  });
  const input = { email: " First-Admin@Example.Test ", fullName: "First administrator", password: "test-only-initial-admin-123!" };
  return { service, pool, input, calls, hashes, state };
}

test("initial bootstrap creates only a fresh normalized admin and audits without the password", async () => {
  const f = await fixture();
  assert.equal((await f.service.createInitialAdmin(f.pool, f.input)).id, 42);
  assert.equal(f.state.users.length, 1);
  assert.equal(f.state.users[0].email, "first-admin@example.test");
  assert.equal(f.state.users[0].hash, "test-pbkdf2-hash");
  assert.deepEqual(f.hashes, [f.input.password]);
  const lock = f.calls.findIndex(call => call.sql.includes("pg_advisory_xact_lock"));
  const guard = f.calls.findIndex(call => call.sql.includes("WHERE role='admin'"));
  assert.ok(lock >= 0 && lock < guard);
  assert.equal(f.calls[lock].values[0], "active-admin-membership");
  assert.equal(f.calls.at(-1).sql, "COMMIT");
  assert.ok(!JSON.stringify(f.calls).includes(f.input.password));
  assert.equal(f.state.released, true);
});
test("an existing admin including a suspended admin permanently closes bootstrap", async () => {
  const f = await fixture({ admins: [{ id: 1, status: "suspended" }] });
  await assert.rejects(() => f.service.createInitialAdmin(f.pool, f.input), error => error.code === "ADMIN_EXISTS");
  assert.equal(f.hashes.length, 0);
  assert.ok(!f.calls.some(call => call.sql.startsWith("INSERT")));
  assert.equal(f.calls.at(-1).sql, "ROLLBACK");
  assert.equal(f.state.released, true);
});
test("bootstrap refuses promoting an existing student account", async () => {
  const f = await fixture({ users: [{ id: 7, email: "first-admin@example.test", role: "student" }] });
  await assert.rejects(() => f.service.createInitialAdmin(f.pool, f.input), error => error.code === "USER_EXISTS");
  assert.equal(f.state.users[0].role, "student");
  assert.equal(f.hashes.length, 0);
  assert.ok(!f.calls.some(call => /^(INSERT|UPDATE)/.test(call.sql)));
});
test("an audit failure rolls back creation and releases the connection", async () => {
  const f = await fixture({ auditFails: true });
  await assert.rejects(() => f.service.createInitialAdmin(f.pool, f.input), /audit unavailable/);
  assert.equal(f.state.users.length, 0);
  assert.equal(f.calls.at(-1).sql, "ROLLBACK");
  assert.equal(f.state.released, true);
});
test("weak passwords cannot reach the database", async () => {
  const f = await fixture({ passwordValid: false });
  await assert.rejects(() => f.service.createInitialAdmin(f.pool, f.input), error => error.code === "INVALID_PASSWORD");
  assert.equal(f.calls.length, 0);
});
