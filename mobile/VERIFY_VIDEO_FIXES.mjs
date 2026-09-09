import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Run behavior regressions rather than relying on obsolete source-code patterns.
const result = spawnSync(process.execPath, ["--test","--test-name-pattern=lesson|video|rotation|fullscreen|capture|back|settings|Expo Web|top-layer","tests/video-player-behavior.test.mjs","tests/runtime-regressions.test.mjs"], { cwd: fileURLToPath(new URL(".", import.meta.url)), stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
