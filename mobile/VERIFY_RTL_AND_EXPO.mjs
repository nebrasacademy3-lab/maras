import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Run behavior regressions rather than relying on obsolete source-code patterns.
const result = spawnSync(process.execPath, ["--test","--test-name-pattern=Arabic|code cells|one-time|Expo Go|native builds|scroll|motion|floating|native channels","tests/account-responsive-behavior.test.mjs","tests/runtime-regressions.test.mjs","tests/social-motion-behavior.test.mjs"], { cwd: fileURLToPath(new URL(".", import.meta.url)), stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
