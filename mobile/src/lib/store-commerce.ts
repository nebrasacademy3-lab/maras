export type StoreMode = "reader" | "direct";

/** Native checkout requires an explicit internal distribution. Debug mode and
 * Expo Go do not override the storefront policy; stale IAP settings fail closed.
 */
export function resolveStoreMode(options: {
  platform: string;
  executionEnvironment?: string;
  development: boolean;
  configuredMode?: unknown;
  distribution?: unknown;
  readerPreview?: boolean;
}): StoreMode {
  const requested = String(options.configuredMode || "reader").trim().toLowerCase();
  if (options.readerPreview) return "reader";
  if (options.platform === "web") return "direct";
  return requested === "direct" && options.distribution === "internal" ? "direct" : "reader";
}

/** Google allows unlinked purchasing information in consumption-only apps.
 * iOS has no external-purchase CTA without an applicable approved entitlement.
 */
export function subscriptionAccessMessage(platform: string, websiteHost: string): string {
  return platform === "android"
    ? "الاشتراك متاح عبر موقع مراس " + websiteHost + ". بعد الاشتراك، سجّل الدخول بالحساب نفسه لتجد محتواك هنا. لا تتوفر عمليات شراء داخل التطبيق."
    : "شاهد المواد واستخدم الخدمات المفعلة في حسابك. تظهر اشتراكاتك الحالية تلقائيًا عند تسجيل الدخول بالحساب نفسه.";
}
