// Private entry point: accepts validated contract data, never caller-provided HTML.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dropPdfRootPrivileges } from "./pdf-runtime-user.mjs";
import { buildInstructorContractPagedDocument } from "../lib/instructor-contract-document.mjs";
import { MAX_PDF_BYTES, StudyPdfError } from "../lib/study-pdf-document.mjs";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
let child;
const stop = () => { child?.kill("SIGKILL"); process.exit(1); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
const deadline = setTimeout(stop, 40_000);
try {
  await dropPdfRootPrivileges(process.env.TMPDIR);
  let size = 0; const parts = [];
  for await (const part of process.stdin) {
    size += part.length;
    if (size > 650_000) throw new StudyPdfError("PDF_INPUT_INVALID");
    parts.push(part);
  }
  const input = JSON.parse(Buffer.concat(parts).toString("utf8"));
  const logo = `data:image/png;base64,${(await readFile(join(root, "public/brand/logo-light-hq.png"))).toString("base64")}`;
  const html = buildInstructorContractPagedDocument(input, { logo });
  const bytes = await new Promise((resolve, reject) => {
    // Paged rendering does not require browser namespaces or any network access.
    // -I ignores Python environment/user packages; the worker installs seccomp.
    child = spawn("/usr/bin/python3", ["-I", join(root, "scripts/contract-pdf-worker.py")], {
      detached: false, stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: "/usr/bin:/bin", HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: "C.UTF-8" },
    });
    const chunks = []; let length = 0, diagnostic = "", failure;
    child.stdin.on("error", () => {});
    child.on("error", () => { failure = "PDF_RENDER_UNAVAILABLE"; });
    child.stderr.on("data", data => { diagnostic = (diagnostic + data.toString("utf8")).slice(-4096); });
    child.stdout.on("data", data => {
      length += data.length;
      if (length > MAX_PDF_BYTES) { failure = "PDF_OUTPUT_LIMIT"; child.kill("SIGKILL"); }
      else chunks.push(data);
    });
    child.on("close", code => {
      if (code !== 0 || failure) return reject(new StudyPdfError(failure || /"code":"(PDF_[A-Z_]+)"/.exec(diagnostic)?.[1] || "PDF_RENDER_UNAVAILABLE"));
      const output = Buffer.concat(chunks);
      if (output.length < 100 || !output.subarray(0, 5).equals(Buffer.from("%PDF-"))) return reject(new StudyPdfError("PDF_OUTPUT_INVALID"));
      resolve(output);
    });
    child.stdin.end(html);
  });
  process.stdout.write(bytes);
} catch (error) {
  child?.kill("SIGKILL");
  process.stderr.write(JSON.stringify({ code: error instanceof StudyPdfError ? error.code : "PDF_RENDER_UNAVAILABLE" }) + "\n");
  process.exitCode = 1;
} finally { clearTimeout(deadline); }
