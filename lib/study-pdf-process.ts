import "server-only";
import { validateInstructorContractPdf, type InstructorContractPdfInput } from "@/lib/instructor-contract-document.mjs";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, isAbsolute } from "node:path";
import { MAX_PDF_BYTES, StudyPdfError, validatePdfInput, type StudyPdfInput } from "@/lib/study-pdf-document.mjs";

export function pdfChildEnvironment(directory: string, qa: boolean, executable: string): NodeJS.ProcessEnv {
  return { NODE_ENV: "production", PATH: "/usr/local/bin:/usr/bin:/bin", HOME: directory, TMPDIR: directory, LANG: "C.UTF-8", MARAS_PDF_CHROMIUM: executable, ...(qa ? { MARAS_PDF_ISOLATED_QA: "1" } : {}) };
}
export function isolatedPdfQaAllowed(env: NodeJS.ProcessEnv = process.env) {
  if (!(env.MARAS_LOOPBACK_QA === "true" && env.CI === "true" && env.GITHUB_ACTIONS === "true") || env.RAILWAY_PROJECT_ID || env.RAILWAY_ENVIRONMENT_ID || env.STUDY_PDF_QA_NO_SANDBOX !== "true") return false;
  try { const database = new URL(env.DATABASE_URL || ""); return database.hostname === "127.0.0.1" && database.pathname === "/maras_qa"; } catch { return false; }
}
export async function renderStudyPdf(input: StudyPdfInput, signal?: AbortSignal): Promise<Buffer> {
  validatePdfInput(input);
  return renderPdfProcess(input, "study", signal);
}
/** Only server-owned, validated document shapes can reach the isolated process. */
export async function renderInstructorContractPdf(input: InstructorContractPdfInput, signal?: AbortSignal): Promise<Buffer> {
  validateInstructorContractPdf(input);
  return renderPdfProcess(input, "contract", signal);
}
async function renderPdfProcess(input: StudyPdfInput | InstructorContractPdfInput, kind: "study" | "contract", signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), "maras-pdf-"));
  const executable = process.env.STUDY_PDF_CHROMIUM_PATH || "/usr/bin/chromium";
  if (!isAbsolute(executable) || /[\u0000-\u001f]/.test(executable)) { await rm(directory, { recursive: true, force: true }); throw new StudyPdfError("PDF_RENDER_UNAVAILABLE"); }
  try {
    return await new Promise<Buffer>((resolveResult, reject) => {
      const child = spawn(process.execPath, ["--max-old-space-size=192", resolve("scripts/study-pdf-renderer.mjs"), kind], { cwd: directory, env: pdfChildEnvironment(directory, isolatedPdfQaAllowed(), executable), stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" });
      const chunks: Buffer[] = []; let length = 0, stderr = "", failure: Error | null = null, browserPid: number | null = null;
      const kill = () => {
        // Chromium inherits this renderer process group, including during launch.
        if (child.pid && process.platform !== "win32") { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already exited */ } }
        else child.kill("SIGKILL");
      };
      const abort = () => { failure = new StudyPdfError("PDF_CANCELLED"); kill(); };
      const timeout = setTimeout(() => { failure = new StudyPdfError("PDF_RENDER_TIMEOUT"); kill(); }, 45_000);
      signal?.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (data: Buffer) => { length += data.length; if (length > MAX_PDF_BYTES) { failure = new StudyPdfError("PDF_OUTPUT_LIMIT"); kill(); } else chunks.push(data); });
      child.stderr.on("data", (data: Buffer) => {
        stderr = (stderr + data.toString("utf8")).slice(-4096);
        const pid = /PDF_BROWSER_PID:(\d+)/.exec(stderr);
        if (pid && Number(pid[1]) > 1) browserPid = Number(pid[1]);
        if (browserPid && stderr.includes(`PDF_BROWSER_EXIT:${browserPid}`)) browserPid = null;
      });
      child.stdin.on("error", () => { /* close/error decides the result, never leave an unhandled EPIPE */ });
      child.on("error", () => { failure = new StudyPdfError("PDF_RENDER_UNAVAILABLE"); });
      child.on("close", code => {
        clearTimeout(timeout); signal?.removeEventListener("abort", abort);
        if (browserPid) kill();
        if (failure || code !== 0) {
          const codeMatch = /"code":"(PDF_[A-Z_]+)"/.exec(stderr);
          reject(failure || new StudyPdfError(codeMatch?.[1] || "PDF_RENDER_UNAVAILABLE")); return;
        }
        const bytes = Buffer.concat(chunks);
        if (bytes.length < 100 || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) reject(new StudyPdfError("PDF_OUTPUT_INVALID"));
        else resolveResult(bytes);
      });
      child.stdin.end(JSON.stringify(input));
      if (signal?.aborted) abort();
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
