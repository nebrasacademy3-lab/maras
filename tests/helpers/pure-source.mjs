import ts from "typescript";
import { readFile } from "node:fs/promises";
/** Compile small pure shared modules without inventing an implementation in a mock. */
export async function pureSource(path, dependencies = {}) {
  const source = await readFile(new URL('../../' + path, import.meta.url), 'utf8');
  const key = '__pure_' + crypto.randomUUID().replaceAll('-', '');
  globalThis[key] = dependencies;
  try {
    const code = `const {${Object.keys(dependencies)}} = globalThis[${JSON.stringify(key)}];\n` + source.replace(/^import\s[\s\S]*?;\r?\n/gm, '');
    const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    return await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  } finally { delete globalThis[key]; }
}
export async function seoPureDependencies(dependencies = {}) {
  return {
    ...await pureSource('lib/public-origin.ts', { process: dependencies.process || process }),
    ...await pureSource('lib/seo-eligibility.ts'),
    ...await pureSource('lib/information-contract.ts'),
    ...dependencies,
  };
}
