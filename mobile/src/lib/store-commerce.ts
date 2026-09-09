/** Purchase controls depend on the build distribution, never on the phone OS alone. */
export function resolveStoreMode(options: {
  platform: string;
  executionEnvironment?: string;
  development: boolean;
  configuredMode?: unknown;
  distribution?: unknown;
  readerPreview?: boolean;
}): "reader" | "direct" {
  const requested = String(options.configuredMode || "reader").trim().toLowerCase();
  // A dedicated QA flag is required; a production reader setting alone must not hide Expo Go checkout.
  if (requested === "reader" && options.readerPreview) return "reader";
  if (options.platform === "web" || options.executionEnvironment === "storeClient" || options.development) return "direct";
  // Release builds fail closed: external checkout is only enabled for internal distribution.
  return requested === "direct" && options.distribution === "internal" ? "direct" : "reader";
}
