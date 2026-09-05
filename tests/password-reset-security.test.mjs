import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/api/auth/reset-password/route.ts", import.meta.url), "utf8");

async function resetScenario() {
  const table = name => Object.fromEntries(["userId", "tokenHash", "usedAt", "expiresAt", "id", "passwordHash", "revokedAt"].map(key => [key, key]).concat([["name", name]]));
  const passwordResetTokens = table("tokens");
  const users = table("users");
  const authSessions = table("sessions");
  const pushDevices = table("pushDevices");
  const emailVerificationCodes = table("emailCodes");
  const state = {
    tokens: [
      { userId: 1, tokenHash: "a".repeat(43), usedAt: null, expiresAt: "2099-01-01T00:00:00.000Z" },
      { userId: 1, tokenHash: "b".repeat(43), usedAt: null, expiresAt: "2099-01-01T00:00:00.000Z" },
      { userId: 2, tokenHash: "c".repeat(43), usedAt: null, expiresAt: "2099-01-01T00:00:00.000Z" },
    ],
    users: [{ id: 1, passwordHash: "old-password" }, { id: 2, passwordHash: "other-password" }],
    sessions: [{ userId: 1, revokedAt: null }, { userId: 2, revokedAt: null }],
    pushDevices: [{ userId: 1, status: "active" }, { userId: 2, status: "active" }],
    emailCodes: [{ userId: 1, usedAt: null }, { userId: 2, usedAt: null }],
  };
  let accountLocked = false;
  const project = (row, fields) => Object.fromEntries(Object.entries(fields).map(([key, column]) => [key, row[column]]));
  const db = {
    select: fields => ({
      from: target => ({
        where: predicate => ({
          limit: async count => state[target.name].filter(predicate).slice(0, count).map(row => project(row, fields)),
        }),
      }),
    }),
    update: target => ({
      set: values => ({
        where: predicate => {
          let applied;
          const apply = () => {
            assert.equal(accountLocked, true, "the account must be locked before claiming or revoking tokens");
            if (applied) return applied;
            applied = state[target.name].filter(predicate);
            for (const row of applied) Object.assign(row, values);
            return applied;
          };
          return { returning: async fields => apply().map(row => project(row, fields)), then: (resolve, reject) => Promise.resolve().then(apply).then(resolve, reject) };
        },
      }),
    }),
    execute: async () => { accountLocked = true; },
    transaction: async callback => {
      try { return await callback(db); } finally { accountLocked = false; }
    },
  };
  const deps = {
    getDb: () => db, passwordResetTokens, users, authSessions, pushDevices, emailVerificationCodes,
    and: (...predicates) => row => predicates.every(predicate => predicate(row)),
    eq: (key, value) => row => row[key] === value,
    gt: (key, value) => row => row[key] > value,
    isNull: key => row => row[key] == null,
    sql: () => ({}),
    checkRateLimit: async () => true,
    clientIp: () => "test",
    hashOpaqueToken: async token => token,
    hashPassword: async password => "hashed:" + password,
    sameOriginRequest: () => true,
    validPassword: password => password.length >= 10,
    cleanText: (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "",
    jsonError: (error, status = 400) => Response.json({ ok: false, error }, { status }),
    readBoundedJsonObject: request => request.json(),
  };
  const key = "__merasResetTest" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = deps;
  try {
    const imports = "const { " + Object.keys(deps).join(", ") + " } = globalThis[" + JSON.stringify(key) + "];\n";
    const isolated = imports + source.replace(/^import .+;\r?\n/gm, "");
    const javascript = ts.transpileModule(isolated, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const route = await import("data:text/javascript;base64," + Buffer.from(javascript).toString("base64"));
    return { state, post: (token, password = "New-password!42") => route.POST(new Request("https://meras.test/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) })) };
  } finally { delete globalThis[key]; }
}

test("a successful password reset revokes every older link and session for only that account", async () => {
  const { state, post } = await resetScenario();
  assert.equal((await post("a".repeat(43))).status, 200);
  assert.equal(state.users[0].passwordHash, "hashed:New-password!42");
  assert.ok(state.tokens[0].usedAt);
  assert.ok(state.tokens[1].usedAt, "the other unconsumed link must be invalidated too");
  assert.equal(state.tokens[2].usedAt, null);
  assert.ok(state.sessions[0].revokedAt);
  assert.equal(state.sessions[1].revokedAt, null);
  assert.equal(state.pushDevices[0].status, "revoked", "signed-out devices must stop receiving account notifications");
  assert.equal(state.pushDevices[1].status, "active");
  assert.ok(state.emailCodes[0].usedAt, "password reset revokes older email codes too");
  assert.equal(state.emailCodes[1].usedAt, null);
  assert.equal((await post("b".repeat(43), "Attacker-password!42")).status, 400);
  assert.equal(state.users[0].passwordHash, "hashed:New-password!42");
});

test("expired and unknown reset links never mutate an account", async () => {
  const { state, post } = await resetScenario();
  state.tokens[0].expiresAt = "2000-01-01T00:00:00.000Z";
  assert.equal((await post("a".repeat(43))).status, 400);
  assert.equal((await post("z".repeat(43))).status, 400);
  assert.equal(state.users[0].passwordHash, "old-password");
  assert.equal(state.sessions[0].revokedAt, null);
});
