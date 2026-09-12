import { readFile } from "node:fs/promises";
import ts from "typescript";
/** Runs actual source with Node standard-library imports. No import mocking. */
export async function standaloneSource(relative) {
 const source = await readFile(new URL("../../"+relative, import.meta.url), "utf8");
 const result=ts.transpileModule(source,{fileName:relative,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
 return import("data:text/javascript;base64,"+Buffer.from(result.outputText).toString("base64"));
}
