export type StoreMode = "reader" | "direct";

/** Purchases belong to the website. No native profile, debug flag or remote
 * setting may turn an installed phone/tablet app into a checkout client. */
export function resolveStoreMode(options: {
  platform: string;
  executionEnvironment?: string;
  development: boolean;
  configuredMode?: unknown;
  distribution?: unknown;
  readerPreview?: boolean;
}): StoreMode {
  return options.platform === "web" && !options.readerPreview ? "direct" : "reader";
}

/** The same neutral access guidance is shown to every native user, not just reviewers. */
export function subscriptionAccessMessage(_platform: string, _websiteHost: string): string {
  return "شاهد المواد واستخدم الخدمات المفعلة في حسابك. تظهر اشتراكاتك الحالية تلقائيًا عند تسجيل الدخول بالحساب نفسه.";
}
