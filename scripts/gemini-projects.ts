// Explicit operator commands. No automatic Google call unless renewal is separately enabled.
import { resolve } from "node:path";
import { closeDb } from "../db";
import { readGeminiControlFile, readGeminiControlToken } from "../lib/gemini-control-files";
import { refreshGeminiProject } from "../lib/gemini-project-verification";
import { disableGeminiProjectRefresh, geminiRefreshSummary, registerGeminiProjectRefresh } from "../lib/gemini-refresh-state";
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "status") {
    console.log(JSON.stringify({ ok: true, ...(await geminiRefreshSummary()) }));
  } else if (args.length === 2 && args[0] === "disable-refresh") {
    console.log(JSON.stringify({ ok: true, ...(await disableGeminiProjectRefresh(args[1])) }));
  } else {
    if (args.length !== 3 || !["verify", "enable-refresh"].includes(args[0]) || args[1] !== "--read-only-google") throw new Error("usage");
    const plan: unknown = JSON.parse(await readGeminiControlFile(resolve(args[2]), false, 65536));
    const token = args[0] === "enable-refresh" ? await readGeminiControlToken(process.env.GEMINI_CONTROL_PLANE_TOKEN_FILE || "") : process.env.GEMINI_CONTROL_PLANE_ACCESS_TOKEN || "";
    const result = await refreshGeminiProject(plan, token);
    const schedule = args[0] === "enable-refresh" ? await registerGeminiProjectRefresh(plan, result.revision) : undefined;
    console.log(JSON.stringify({ ok: true, ...result, ...(schedule ? { refresh: schedule } : {}) }));
  }
} catch {
  console.error("Gemini project control failed. Check the non-secret plan, database, read-only Google permissions and private short-lived token source. No generation or billing mutation was requested.");
  process.exitCode = 1;
} finally { await closeDb(); }
