import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

export async function loadMobileRouting() {
  const source = await readFile(new URL("../mobile/src/lib/notification-routing.ts", import.meta.url), "utf8");
  const exports = {};
  const pushed = [];
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, URL, URLSearchParams,
    require: (name) => {
      if (name === "expo-router") return { router: { push: (route) => pushed.push(route) } };
      if (name === "react-native") return { Linking: { openURL: async () => {} } };
      throw new Error("Unexpected import: " + name);
    },
  });
  return { ...exports, pushed };
}
