import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

/** Execute repository TypeScript with Node's type erasure; never copy its logic. */
export async function nativeSource(path, dependencies) {
  let source = await readFile(new URL("../../" + path, import.meta.url), "utf8");
  const key = "__native_" + crypto.randomUUID().replaceAll("-", "");
  if (dependencies) {
    globalThis[key] = dependencies;
    source = `const {${Object.keys(dependencies)}} = globalThis[${JSON.stringify(key)}];\n` + source.replace(/^import\s[\s\S]*?;\r?\n/gm, "");
  }
  try {
    const code = stripTypeScriptTypes(source, { mode: "transform", sourceUrl: path });
    return await import("data:text/javascript;base64," + Buffer.from(code + `\n// ${key}`).toString("base64"));
  } finally { delete globalThis[key]; }
}
