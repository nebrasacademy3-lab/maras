/** Startup probe uses synthetic data only; never loads .env, DB, users or contracts. */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = await mkdtemp(join(tmpdir(), "maras-pdf-probe-"));
const input = {
  id: 1, version: 1, status: "draft", title: "اختبار تشغيل PDF — Synthetic runtime probe",
  termsAr: "محتوى اختبار اصطناعي، وليس عقدًا حقيقيًا.", termsEn: "Synthetic runtime check. This is not an actual agreement.",
  compensationModel: "hourly", rateHalalas: 100, trialDays: 0, trialTermsAr: "اختبار", trialTermsEn: "Test",
  contentHash: "", signedAt: "", signature: null,
  instructor: { fullName: "اختبار اصطناعي", email: "probe@example.test", phone: "", country: "", address: "" },
  organization: { legal_name: "اختبار", legal_address: "", commercial_registration_number: "", vat_number: "", employment_authorization_number: "" },
  employment: { startDate: "", endDate: "", workLocation: "", weeklyHours: 0, nationality: "", paymentTermsAr: "", paymentTermsEn: "", benefitsAr: "", benefitsEn: "" },
};
try {
  const bytes = await new Promise((resolve, reject) => {
    // Same production renderer, scrubbed environment and sandbox; QA bypass absent.
    const child = spawn(process.execPath, ["--max-old-space-size=192", join(root, "scripts/study-pdf-renderer.mjs"), "contract"], {
      cwd: directory, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"],
      env: { NODE_ENV: "production", PATH: "/usr/local/bin:/usr/bin:/bin", HOME: directory, TMPDIR: directory, LANG: "C.UTF-8", MARAS_PDF_CHROMIUM: process.env.STUDY_PDF_CHROMIUM_PATH || "/usr/bin/chromium" },
    });
    const chunks = []; let size = 0, diagnostic = "", failure;
    const kill = () => { try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch { /* already stopped */ } };
    const timer = setTimeout(() => { failure = "PDF_RENDER_TIMEOUT"; kill(); }, 45000);
    child.on("error", () => { failure = "PDF_RENDER_UNAVAILABLE"; });
    child.stdin.on("error", () => {});
    child.stdout.on("data", chunk => { size += chunk.length; if (size > 20 * 1024 * 1024) { failure = "PDF_OUTPUT_LIMIT"; kill(); } else chunks.push(chunk); });
    child.stderr.on("data", chunk => { diagnostic = (diagnostic + chunk.toString("utf8")).slice(-4096); });
    child.on("close", code => {
      clearTimeout(timer); kill();
      if (code !== 0 || failure) return reject(new Error(failure || /"code":"(PDF_[A-Z_]+)"/.exec(diagnostic)?.[1] || "PDF_RENDER_UNAVAILABLE"));
      const output = Buffer.concat(chunks);
      if (output.length < 100 || !output.subarray(0, 5).equals(Buffer.from("%PDF-"))) return reject(new Error("PDF_OUTPUT_INVALID"));
      resolve(output.length);
    });
    child.stdin.end(JSON.stringify(input));
  });
  console.info(JSON.stringify({ event: "PDF_RUNTIME_READY", bytes, sandbox: true, synthetic: true }));
} catch (error) {
  console.error(JSON.stringify({ event: "PDF_RUNTIME_FAILED", code: /^PDF_[A-Z_]+$/.test(error.message) ? error.message : "PDF_RENDER_UNAVAILABLE", synthetic: true }));
  process.exitCode = 1;
} finally { await rm(directory, { recursive: true, force: true }); }
