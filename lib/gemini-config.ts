/** Accept the model resource name copied from Google's Models API as well as its ID. */
export function normalizeGeminiModel(value: unknown) {
  if (typeof value !== "string") return "";
  const model = value.trim().replace(/^models\//, "");
  return /^[A-Za-z][A-Za-z0-9._-]{1,99}$/.test(model) ? model : "";
}

export type GeminiModelOption = { id: string; displayName: string; inputTokenLimit: number; outputTokenLimit: number };

/** Metadata is descriptive only: listing a model does not prove generation quota/access. */
export function geminiModelOption(value: unknown): GeminiModelOption | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const id = normalizeGeminiModel(item.name);
  if (!id || !Array.isArray(item.supportedGenerationMethods) || !item.supportedGenerationMethods.includes("generateContent")) return null;
  const limit = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
  return { id, displayName: typeof item.displayName === "string" ? item.displayName.slice(0, 128) : id, inputTokenLimit: limit(item.inputTokenLimit), outputTokenLimit: limit(item.outputTokenLimit) };
}
