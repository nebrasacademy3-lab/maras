// The Next.js compiler normally resolves the server-only marker. This dedicated
// Node worker is a server entry point too; keep the application's browser guard
// intact and resolve the marker only in this worker's module loader.
import { register } from "node:module";
register("./ai-worker-loader.mjs", import.meta.url);
