import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, access, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { runtimeServices, shutdownTimeout } from "../scripts/runtime-supervisor.mjs";
const supervisorUrl = new URL("../scripts/runtime-supervisor.mjs", import.meta.url).href;

async function until(check, label) {
  const end = Date.now() + 5000;
  while (Date.now() < end) { if (await check()) return; await sleep(20); }
  throw new Error(`Timed out: ${label}`);
}
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function running(pid) {
  try {
    process.kill(pid, 0);
    // A terminated grandchild can briefly be a zombie until the host init reaps
    // it. Production uses tini -s; never mistake a zombie for executing work.
    if (process.platform === "linux") return (await readFile(`/proc/${pid}/stat`, "utf8")).split(") ")[1][0] !== "Z";
    return true;
  } catch { return false; }
}

async function fixture(t, specs, shutdownMs = 1000) {
  const directory = await mkdtemp(join(tmpdir(), "meras-runtime-test-"));
  const pidPaths = specs.map(spec => join(directory, spec.name + ".pid"));
  const trigger = join(directory, "exit-now");
  const services = specs.map((spec, index) => ({ name: spec.name, command: spec.missing ? "/nonexistent-synthetic-runtime-command" : process.execPath, args: spec.missing ? [] : ["--input-type=module", "-e", `
    import { writeFileSync, existsSync } from 'node:fs';
    import { spawn } from 'node:child_process';
    ${spec.ignore ? "process.on('SIGTERM', () => {});" : `process.on('SIGTERM', () => { writeFileSync(${JSON.stringify(join(directory, spec.name + ".stopped"))}, 'stopped'); process.exit(0); });`}
    ${spec.grandchild ? `const grandchild = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: 'ignore' }); writeFileSync(${JSON.stringify(join(directory, "grandchild.pid"))}, String(grandchild.pid));` : ""}
    writeFileSync(${JSON.stringify(pidPaths[index])}, String(process.pid));
    setInterval(() => { ${spec.exitCode !== undefined ? `if (existsSync(${JSON.stringify(trigger)})) process.exit(${spec.exitCode});` : ""} }, 20);
  `] }));
  const events = []; let stderr = "";
  const driver = spawn(process.execPath, ["--input-type=module", "-e", `
    import { supervise } from ${JSON.stringify(supervisorUrl)};
    process.exitCode = await supervise(${JSON.stringify(services)}, { shutdownMs: ${shutdownMs}, onEvent: event => process.send(event) });
    if (process.connected) process.disconnect();
  `], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  driver.stderr.on("data", bytes => { stderr += bytes; });
  driver.on("message", event => events.push(event));
  const done = new Promise((resolve, reject) => { driver.once("error", reject); driver.once("close", (code, signal) => resolve({ code, signal })); });
  t.after(async () => {
    for (const path of [...pidPaths, join(directory, "grandchild.pid")]) {
      if (!await exists(path)) continue;
      const pid = Number(await readFile(path, "utf8"));
      try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch {} }
    }
    driver.kill("SIGKILL"); await done;
    await rm(directory, { recursive: true, force: true });
  });
  return { driver, done, events, directory, pidPaths, trigger, stderr: () => stderr,
    ready: () => until(async () => (await Promise.all(pidPaths.map(exists))).every(Boolean), "all synthetic services ready"),
    stopped: async () => { for (const path of pidPaths) if (await exists(path)) assert.equal(await running(Number(await readFile(path, "utf8"))), false); },
  };
}

test("runtime service configuration enables required workers and uses fixed argv", () => {
  const services = runtimeServices({});
  assert.deepEqual(services.map(service => service.name), ["video-worker", "ai-worker", "web"]);
  assert.ok(services.every(service => service.command === process.execPath));
  assert.ok(services.find(service => service.name === "ai-worker").args.includes("./scripts/ai-worker-runtime.mjs"));
  assert.equal(runtimeServices({ VIDEO_WORKER_ENABLED: "false", AI_WORKER_ENABLED: " FALSE ", PORT: "8080" }).length, 1);
  assert.deepEqual(runtimeServices({ PORT: "8080" }).at(-1).args.slice(-2), ["--port", "8080"]);
  assert.equal(shutdownTimeout({}), 25000);
  assert.equal(shutdownTimeout({ RUNTIME_SHUTDOWN_TIMEOUT_MS: "1000" }), 1000);
});

test("invalid runtime flags, one-shot workers and shell-like port values fail closed", () => {
  for (const env of [{ PORT: "3000; echo secret" }, { PORT: "0" }, { PORT: "65536" }, { VIDEO_WORKER_ENABLED: "yes" }, { AI_WORKER_ENABLED: "unexpected" }, { VIDEO_WORKER_ONCE: "true" }]) assert.throws(() => runtimeServices(env));
  for (const value of ["NaN", "Infinity", "0", "60001", "1.1", "-1"]) assert.throws(() => shutdownTimeout({ RUNTIME_SHUTDOWN_TIMEOUT_MS: value }));
});

test("an unexpectedly successful worker exit still fails the service and terminates web", { timeout: 10000 }, async t => {
  const f = await fixture(t, [{ name: "worker", exitCode: 0 }, { name: "web" }]); await f.ready();
  await writeFile(f.trigger, "exit"); assert.deepEqual(await f.done, { code: 1, signal: null });
  await f.stopped(); assert.equal(await exists(join(f.directory, "web.stopped")), true);
  assert.equal(f.events.filter(event => event.event === "runtime.stopping").length, 1);
});

test("worker failure preserves a nonzero exit code and is never silently restarted locally", { timeout: 10000 }, async t => {
  const f = await fixture(t, [{ name: "worker", exitCode: 23 }, { name: "web" }]); await f.ready();
  await writeFile(f.trigger, "exit"); assert.equal((await f.done).code, 23); await f.stopped();
  assert.equal(f.events.filter(event => event.event === "runtime.started" && event.service === "worker").length, 1);
});

test("a failing web process shuts down its worker peers", { timeout: 10000 }, async t => {
  const f = await fixture(t, [{ name: "worker" }, { name: "web", exitCode: 4 }]); await f.ready();
  await writeFile(f.trigger, "exit"); assert.equal((await f.done).code, 4); await f.stopped();
});

test("spawn failure fails safely without logging command paths or raw errors", { timeout: 10000 }, async t => {
  const f = await fixture(t, [{ name: "missing-worker", missing: true }, { name: "web" }]);
  assert.equal((await f.done).code, 1); await f.stopped();
  assert.equal(f.events.filter(event => event.event === "runtime.stopping").length, 1);
  assert.doesNotMatch(JSON.stringify(f.events) + f.stderr(), /nonexistent-synthetic-runtime-command|ENOENT/);
});

test("SIGTERM gracefully stops every enabled service without an error exit", { timeout: 10000 }, async t => {
  const f = await fixture(t, [{ name: "video-worker" }, { name: "ai-worker" }, { name: "web" }]); await f.ready();
  f.driver.kill("SIGTERM"); assert.deepEqual(await f.done, { code: 0, signal: null }); await f.stopped();
  for (const name of ["video-worker", "ai-worker", "web"]) assert.equal(await exists(join(f.directory, name + ".stopped")), true);
  assert.equal(f.events.some(event => event.event === "runtime.shutdown.forced"), false);
});

test("a service ignoring termination is forcibly stopped within the shutdown bound", { timeout: 10000 }, async t => {
  const f = await fixture(t, [{ name: "worker", ignore: true }, { name: "web" }], 150); await f.ready();
  const start = Date.now(); f.driver.kill("SIGTERM"); await f.done; await f.stopped();
  assert.ok(Date.now() - start < 3000); assert.equal(f.events.some(event => event.event === "runtime.shutdown.forced"), true);
});

test("a repeat termination signal escalates safely without duplicate finalization", { timeout: 10000 }, async t => {
  const f = await fixture(t, [{ name: "worker", ignore: true }, { name: "web" }], 5000); await f.ready();
  f.driver.kill("SIGTERM"); await until(() => f.events.some(event => event.event === "runtime.stopping"), "shutdown starts");
  f.driver.kill("SIGINT"); await f.done; await f.stopped();
  assert.equal(f.events.filter(event => event.event === "runtime.stopped").length, 1);
});

test("worker descendants are stopped even after their parent exits", { timeout: 10000, skip: process.platform === "win32" }, async t => {
  const f = await fixture(t, [{ name: "worker", exitCode: 8, grandchild: true }, { name: "web" }], 150); await f.ready();
  const grandchild = Number(await readFile(join(f.directory, "grandchild.pid"), "utf8"));
  await writeFile(f.trigger, "exit"); await f.done; await f.stopped();
  assert.equal(await running(grandchild), false);
});
