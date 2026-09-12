export function geminiGenerationConfig(input: { temperature: number; maxOutputTokens: number; responseSchema?: Record<string, unknown> }) {
  const config: Record<string, unknown> = { temperature: input.temperature, maxOutputTokens: input.maxOutputTokens };
  if (input.responseSchema) {
    config.responseMimeType = "application/json";
    // This application uses JSON Schema (union types/additionalProperties), not the
    // different OpenAPI Schema accepted by the legacy responseSchema field.
    config.responseJsonSchema = input.responseSchema;
  }
  return config;
}

export function shouldTryNextGeminiKey(error: { retryable: boolean; invalidCredential: boolean; code: string }) {
  return error.retryable || error.invalidCredential || [
    "AI_KEY_RESTRICTED", "AI_PERMISSION_DENIED", "AI_API_DISABLED", "AI_BILLING_REQUIRED", "AI_QUOTA_EXHAUSTED", "AI_MODEL_UNAVAILABLE",
  ].includes(error.code);
}
