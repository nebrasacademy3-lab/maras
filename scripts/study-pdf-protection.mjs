// Reader-enforced document permissions complement authenticated downloads and a
// personal footer. They are not DRM; software can ignore PDF owner permissions.
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { MAX_PDF_BYTES, StudyPdfError } from "../lib/study-pdf-document.mjs";
export async function protectStudyPdf(bytes, directory, executable = "/usr/bin/qpdf") {
  const source = join(directory, "study-unprotected.pdf"), output = join(directory, "study-protected.pdf");
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_PDF_BYTES || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new StudyPdfError("PDF_OUTPUT_INVALID");
  await writeFile(source, bytes, { mode: 0o600, flag: "wx" });
  try {
    await new Promise((resolve, reject) => {
      // @- keeps the random owner password off process listings and log output.
      const child = spawn(executable, ["@-"], { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
      let failure = false;
      const timer = setTimeout(() => { failure = true; child.kill("SIGKILL"); }, 8000);
      child.once("error", () => { clearTimeout(timer); reject(new StudyPdfError("PDF_PROTECTION_UNAVAILABLE")); });
      child.once("close", code => { clearTimeout(timer); if (failure || code !== 0) reject(new StudyPdfError("PDF_PROTECTION_FAILED")); else resolve(); });
      child.stdin.on("error", () => {});
      child.stdin.end(["--encrypt", "", randomBytes(32).toString("hex"), "256", "--print=full", "--modify=none", "--extract=n", "--accessibility=y", "--", source, output, ""].join("\n"));
    });
    const protectedBytes = await readFile(output);
    if (protectedBytes.length > MAX_PDF_BYTES || !protectedBytes.subarray(0, 5).equals(Buffer.from("%PDF-")) || !protectedBytes.includes(Buffer.from("/Encrypt"))) throw new StudyPdfError("PDF_PROTECTION_FAILED");
    return protectedBytes;
  } finally {
    await Promise.all([rm(source, { force: true }), rm(output, { force: true })]);
  }
}
