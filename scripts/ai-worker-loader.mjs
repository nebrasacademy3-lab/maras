export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: new URL("./ai-worker-server-only.mjs", import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
