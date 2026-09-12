import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import ts from "typescript";
/** Execute the actual TypeScript module with explicit test doubles for imports.
 * This tests application behavior, not PostgreSQL/Next/React integration.
 */
export async function isolatedSource(relative, dependencies={}) {
 const key="__merasTest"+randomUUID().replaceAll("-","");
 const source=await readFile(new URL("../../"+relative,import.meta.url),"utf8");
 const ast=ts.createSourceFile(relative,source,ts.ScriptTarget.Latest,true);
 const imports=ast.statements.filter(ts.isImportDeclaration);let input=source;
 for(const statement of imports.reverse()) input=input.slice(0,statement.getFullStart())+input.slice(statement.end);
 globalThis[key]=dependencies;
 try {const preamble="const {"+Object.keys(dependencies).filter(name=>name!=="default").join(",")+"}=globalThis["+JSON.stringify(key)+"];\n";
 const output=ts.transpileModule(preamble+input,{fileName:relative,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
 if(output.diagnostics?.length)throw new Error(output.diagnostics.map(item=>ts.flattenDiagnosticMessageText(item.messageText," ")).join("\n"));
 return await import("data:text/javascript;base64,"+Buffer.from(output.outputText).toString("base64"));
 }finally{delete globalThis[key];}
}
