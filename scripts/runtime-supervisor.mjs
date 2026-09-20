import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isAbsolute, normalize, resolve } from "node:path";

/** Fixed argv, never a shell command, even when configuration contains metacharacters. */
export function runtimeServices(env = process.env) {
  const enabled = (name, fallback = "true") => {
    const value = (env[name] || fallback).trim().toLowerCase();
    if (value !== "true" && value !== "false") throw new Error(`Invalid ${name}; use true or false`);
    return value === "true";
  };
  const port = (env.PORT || "3000").trim();
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("Invalid PORT");
  const services = [];
  if (enabled("GEMINI_PROJECT_REFRESH_ENABLED", "false")) {
    const tokenFile = env.GEMINI_CONTROL_PLANE_TOKEN_FILE || "";
    if (!isAbsolute(tokenFile) || normalize(tokenFile) !== tokenFile || tokenFile.includes("\0") || tokenFile.length > 4096) throw new Error("Invalid Gemini renewal token source");
    services.push({ name: "gemini-project-refresh-worker", command: process.execPath, args: ["--import", "./scripts/ai-worker-runtime.mjs", "--require", "./scripts/tsx-runtime-bootstrap.cjs", "--import", "tsx", "scripts/gemini-project-refresh-worker.ts"] });
  }
  if (enabled("STORAGE_CLEANUP_WORKER_ENABLED")) services.push({ name: "storage-cleanup-worker", command: process.execPath, args: ["--require", "./scripts/tsx-runtime-bootstrap.cjs", "--import", "tsx", "scripts/storage-cleanup-worker.ts"] });
  if (enabled("VIDEO_WORKER_ENABLED")) {
    if ((env.VIDEO_WORKER_ONCE || "").trim().toLowerCase() === "true") throw new Error("VIDEO_WORKER_ONCE is not allowed in the supervised service");
    services.push({ name: "video-worker", command: process.execPath, args: ["--require", "./scripts/tsx-runtime-bootstrap.cjs", "--import", "tsx", "scripts/video-worker.ts"] });
  }
  if (enabled("AI_WORKER_ENABLED")) services.push({ name: "ai-worker", command: process.execPath, args: ["--import", "./scripts/ai-worker-runtime.mjs", "--require", "./scripts/tsx-runtime-bootstrap.cjs", "--import", "tsx", "scripts/ai-worker.ts"] });
  services.push({ name: "web", command: process.execPath, args: ["./node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", port] });
  return services;
}

export function shutdownTimeout(env = process.env) {
  const value = (env.RUNTIME_SHUTDOWN_TIMEOUT_MS || "25000").trim();
  if (!/^\d+$/.test(value) || Number(value) < 1000 || Number(value) > 60000) throw new Error("RUNTIME_SHUTDOWN_TIMEOUT_MS must be between 1000 and 60000");
  return Number(value);
}

/**
 * A failed required process fails the deployment rather than leaving a misleading
 * healthy web server. Process groups also receive shutdown (including FFmpeg).
 * Docker installs tini as a subreaper to reap orphaned grandchildren on Linux.
 * This detects process exits, not a live-but-stalled worker or provider outage.
 */
export function supervise(services, { cwd = process.cwd(), env = process.env, shutdownMs = 25000, onEvent = (event) => console.info(JSON.stringify(event)) } = {}) {
  if (!services.length || !Number.isSafeInteger(shutdownMs) || shutdownMs < 1 || shutdownMs > 60000) throw new Error("Invalid runtime supervision configuration");
  const names = new Set();
  for (const service of services) {
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(service.name) || names.has(service.name) || typeof service.command !== "string" || !service.command || !Array.isArray(service.args) || service.args.some(arg => typeof arg !== "string")) throw new Error("Invalid runtime service");
    names.add(service.name);
  }
  const grouped = process.platform !== "win32";
  return new Promise((resolveResult) => {
    const children = [];
    let stopping = false, finished = false, resultCode = 0;
    let graceTimer, finalTimer, pollTimer;
    const emit = (event) => { try { onEvent(event); } catch { /* Logging must not prevent termination. */ } };
    const signalChild = (slot, signal) => {
      if (!slot.child.pid) return;
      try {
        if (grouped) process.kill(-slot.child.pid, signal);
        else if (!slot.closed) slot.child.kill(signal);
      } catch (error) {
        if (error?.code !== "ESRCH") { resultCode = 1; emit({ event: "runtime.signal.failed", service: slot.name }); }
      }
    };
    const groupExists = (slot) => {
      if (!slot.child.pid) return false;
      if (!grouped) return !slot.closed;
      try { process.kill(-slot.child.pid, 0); return true; } catch (error) { return error?.code !== "ESRCH"; }
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(graceTimer); clearTimeout(finalTimer); clearInterval(pollTimer);
      for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.removeListener(signal, requestedStop);
      emit({ event: "runtime.stopped", code: resultCode });
      resolveResult(resultCode);
    };
    const checkStopped = () => {
      if (stopping && children.every(slot => slot.closed && !groupExists(slot))) finish();
    };
    const forceStop = () => {
      if (finished) return;
      emit({ event: "runtime.shutdown.forced" });
      for (const slot of children) signalChild(slot, "SIGKILL");
      // Keep error/close listeners installed until all children have been reaped.
      finalTimer ??= setTimeout(() => { resultCode = 1; finish(); }, 1000);
    };
    const stop = (code, reason) => {
      if (stopping) return;
      stopping = true; resultCode = code;
      emit({ event: "runtime.stopping", reason, code });
      graceTimer = setTimeout(forceStop, shutdownMs);
      pollTimer = setInterval(checkStopped, 25);
      for (const slot of children) signalChild(slot, "SIGTERM");
      checkStopped();
    };
    function requestedStop() {
      if (stopping) forceStop();
      else stop(0, "termination-requested");
    }
    for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, requestedStop);
    for (const service of services) {
      if (stopping) break;
      try {
        const child = spawn(service.command, service.args, { cwd, env, detached: grouped, shell: false, stdio: "inherit" });
        const slot = { child, name: service.name, closed: false };
        children.push(slot);
        child.once("spawn", () => emit({ event: "runtime.started", service: slot.name, pid: child.pid }));
        child.on("error", () => {
          emit({ event: "runtime.process.failed", service: slot.name });
          stop(1, "process-error");
        });
        child.once("exit", (code) => {
          if (!stopping) {
            emit({ event: "runtime.process.exited", service: slot.name, code });
            stop(Number.isInteger(code) && code > 0 && code < 256 ? code : 1, "unexpected-exit");
          }
        });
        child.once("close", () => { slot.closed = true; checkStopped(); });
      } catch {
        emit({ event: "runtime.process.failed", service: service.name });
        stop(1, "spawn-error");
      }
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const services = runtimeServices(), shutdownMs = shutdownTimeout();
    if (process.argv.includes("--check")) console.info("Runtime configuration is valid.");
    else process.exitCode = await supervise(services, { shutdownMs });
  } catch {
    // Do not serialize configuration, command arguments, credentials or raw errors.
    console.error("[fatal] Invalid runtime configuration; check worker flags, PORT and shutdown timeout.");
    process.exitCode = 78;
  }
}
