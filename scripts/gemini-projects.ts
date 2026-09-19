// Explicit operator command, never executed by web startup or CI against Google.
import { lstat, readFile } from "node:fs/promises";
import { closeDb } from "../db";
import { refreshGeminiProject } from "../lib/gemini-project-verification";
try {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== "verify" || args[1] !== "--read-only-google") throw new Error("usage");
  const file = await lstat(args[2]);
  if (!file.isFile() || file.isSymbolicLink() || file.size > 65536) throw new Error("input");
  const plan: unknown = JSON.parse(await readFile(args[2], "utf8"));
  const result = await refreshGeminiProject(plan, process.env.GEMINI_CONTROL_PLANE_ACCESS_TOKEN || "");
  console.log(JSON.stringify({ ok: true, ...result }));
} catch {
  console.error("Gemini project verification failed. Check the non-secret plan, database, read-only Google permissions and short-lived access token. No generation or billing mutation was requested.");
  process.exitCode = 1;
} finally { await closeDb(); }
