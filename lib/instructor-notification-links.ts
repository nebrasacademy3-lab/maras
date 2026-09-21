/** Only known instructor/shared destinations may be opened from staff notices. */
export function instructorNotificationHref(value: unknown): string | null {
 if (typeof value !== "string" || value.length > 1024 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return null;
 try {
  const url = new URL(value, "https://meras.invalid");
  if (url.origin !== "https://meras.invalid" || /%/.test(url.pathname)) return null;
  if (!["/instructor", "/notifications", "/support", "/faq", "/privacy", "/terms", "/contact", "/about"].includes(url.pathname)) return null;
  // Discard arbitrary navigation/return parameters supplied by a notice.
  const tab = url.searchParams.get("tab");
  return url.pathname + (url.pathname === "/instructor" && tab && ["profile", "documents", "contracts", "assignments", "bank", "security"].includes(tab) ? "?tab=" + tab : "");
 } catch { return null; }
}
