import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StudyPlanError, type StudyPartInput } from "@/lib/study-processing-plan";

const MAX_SOURCE = 50 * 1024 * 1024, MAX_PACKET = 16 * 1024 * 1024;
export function pdfSourceEnvironment(directory: string): NodeJS.ProcessEnv {
  // Parser processes receive neither provider credentials nor a database URL.
  return { NODE_ENV: "production", PATH: "/usr/bin:/bin", HOME: directory, TMPDIR: directory, LANG: "C", LC_ALL: "C" };
}
async function pdfCommand(command: "pdfinfo" | "pdfseparate" | "pdfunite", args: string[], directory: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  if (process.platform !== "linux") throw new StudyPlanError("AI_PDF_TOOL_UNAVAILABLE", "معالجة PDF الكبيرة تحتاج عامل Linux المعزول؛ لم نرسل ملفًا غير مفحوص.");
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/prlimit", ["--as=805306368", "--cpu=20", "--fsize=16777216", "--nofile=128", "--", `/usr/bin/${command}`, ...args], {
      cwd: directory, env: pdfSourceEnvironment(directory), stdio: ["ignore", "pipe", "pipe"], detached: true,
    });
    let output = "", count = 0, failure: Error | null = null;
    const kill = () => { if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already exited */ } } };
    const abort = () => { failure = new StudyPlanError("AI_PDF_CANCELLED", "أوقفت معالجة PDF قبل اكتمال الجزء."); kill(); };
    const timer = setTimeout(() => { failure = new StudyPlanError("AI_PDF_SOURCE_LIMIT", "تجاوز PDF مهلة التحليل الآمن؛ لم نعتمد جزءًا ناقصًا."); kill(); }, 25_000);
    signal?.addEventListener("abort", abort, { once: true });
    const data = (buffer: Buffer, stdout: boolean) => { count += buffer.length; if (count > 128 * 1024) { failure = new StudyPlanError("AI_PDF_SOURCE_LIMIT", "تجاوز PDF حد التشخيص الآمن."); kill(); } else if (stdout) output += buffer.toString("utf8"); };
    child.stdout.on("data", buffer => data(buffer, true)); child.stderr.on("data", buffer => data(buffer, false));
    child.on("error", () => { failure = new StudyPlanError("AI_PDF_TOOL_UNAVAILABLE", "أدوات PDF غير متاحة في العامل؛ لم يبدأ التوليد."); });
    child.on("close", code => {
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
      if (failure || code !== 0) reject(failure || new StudyPlanError("AI_PDF_SOURCE_INVALID", "تعذر قراءة PDF ضمن الحدود الآمنة. الملف المشفر أو التالف غير مقبول."));
      else resolve(output);
    });
    if (signal?.aborted) abort();
  });
}
async function withPdf<T>(bytes: Buffer, action: (directory: string, path: string) => Promise<T>) {
  if (bytes.length < 8 || bytes.length > MAX_SOURCE || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new StudyPlanError("AI_PDF_SOURCE_INVALID", "توقيع PDF أو حجمه غير صالح.");
  const directory = await mkdtemp(join(tmpdir(), "maras-study-source-"));
  try { const path = join(directory, "source.pdf"); await writeFile(path, bytes, { mode: 0o600, flag: "wx" }); return await action(directory, path); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
export function parseStudyPdfInfo(info: string) {
  const pages = [...info.matchAll(/^Pages:\s*(\d+)\s*$/gm)];
  const field = (name: string, expected: string) => { const matches = [...info.matchAll(new RegExp(`^${name}:\\s*(\\S+)[^\\n]*$`, "gm"))]; return matches.length === 1 && matches[0][1] === expected; };
  if (pages.length !== 1 || !field("Encrypted", "no") || !field("JavaScript", "no") || !field("Form", "none")) throw new StudyPlanError("AI_PDF_SOURCE_INVALID", "PDF مشفر أو تفاعلي أو غير قابل للتحقق. صدّر نسخة دراسية ثابتة.");
  const count = Number(pages[0][1]);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw new StudyPlanError("AI_DOCUMENT_PLAN_LIMIT", "حد PDF التشغيلي 1000 صفحة؛ لم تُحذف الصفحات الزائدة.");
  return count;
}
export async function studyPdfPageCount(bytes: Buffer, signal?: AbortSignal) {
  return withPdf(bytes, async (directory, path) => parseStudyPdfInfo(await pdfCommand("pdfinfo", [path], directory, signal)));
}
/** Preserve the original page graphics. Adjacent pages are labelled context-only. No OCR or external URL fetching. */
export async function studyPdfPacket(bytes: Buffer, part: StudyPartInput, signal?: AbortSignal): Promise<{ bytes: Buffer; pages: number[]; corePages: number[] }> {
  signal = AbortSignal.any([AbortSignal.timeout(75_000), ...(signal ? [signal] : [])]);
  const corePages = part.units.map(unit => unit.page!);
  if (!Number.isSafeInteger(part.sourcePages) || part.sourcePages! < 1 || part.sourcePages! > 1000 || !corePages.length || corePages.length > 4 || corePages.some((page, index) => !Number.isInteger(page) || page < 1 || page > part.sourcePages! || (index > 0 && page !== corePages[index - 1] + 1))) throw new StudyPlanError("AI_PLAN_INVALID", "نطاق صفحات الجزء غير صالح.");
  const first = Math.max(1, corePages[0] - 1), last = Math.min(part.sourcePages!, corePages.at(-1)! + 1);
  const pages = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  return withPdf(bytes, async (directory, path) => {
    const count = parseStudyPdfInfo(await pdfCommand("pdfinfo", [path], directory, signal));
    if (count !== part.sourcePages) throw new StudyPlanError("AI_SOURCE_CHANGED", "تغيّر عدد صفحات المصدر؛ لم نخلط إصدارين.");
    const paths: string[] = []; let total = 0;
    // One page per command bounds simultaneous disk growth, even for pathological PDFs.
    for (const page of pages) {
      await pdfCommand("pdfseparate", ["-f", String(page), "-l", String(page), path, join(directory, "page-%d.pdf")], directory, signal);
      const output = join(directory, `page-${page}.pdf`), size = (await stat(output)).size;
      total += size;
      if (size < 8 || total > MAX_PACKET) throw new StudyPlanError("AI_DOCUMENT_REVIEW_REQUIRED", "صفحات هذا الجزء أكبر من حد المعالجة الآمن دون تقليل جودة الرسومات. الأجزاء السابقة محفوظة.");
      paths.push(output);
    }
    const output = join(directory, "packet.pdf");
    if (paths.length === 1) { const result = await readFile(paths[0]); return { bytes: result, pages, corePages }; }
    await pdfCommand("pdfunite", [...paths, output], directory, signal);
    const size = (await stat(output)).size;
    if (size < 8 || size > MAX_PACKET) throw new StudyPlanError("AI_PDF_SOURCE_LIMIT", "تجاوز جزء PDF حد الحجم الآمن.");
    const result = await readFile(output);
    if (!result.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new StudyPlanError("AI_PDF_SOURCE_INVALID", "لم ينتج التحويل ملف PDF صالحًا.");
    return { bytes: result, pages, corePages };
  });
}
