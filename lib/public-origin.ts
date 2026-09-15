/** Public links never derive their host from an incoming request or proxy header. */
export const DEFAULT_PUBLIC_ORIGIN = "https://marasalelm.com";

export function normalizePublicOrigin(value: string | undefined, allowDevelopment = false): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.username || url.password || url.search || url.hash || !["https:", "http:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const loopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    if (allowDevelopment && loopback) return url.origin;
    // Never publish a listener, private-network address or platform-internal DNS name.
    if (loopback || !host.includes(".") || host.includes(":") || /(?:^|\.)(?:localhost|local|internal|invalid)$/.test(host)) return null;
    const parts = host.split(".").map(Number);
    if (parts.length === 4 && parts.every(Number.isInteger)) {
      const [a, b] = parts;
      if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127) return null;
    }
    return url.protocol === "https:" ? url.origin : null;
  } catch { return null; }
}

export function configuredPublicOrigin(allowDevelopment = false) {
  return normalizePublicOrigin(process.env.NEXT_PUBLIC_SITE_URL, allowDevelopment)
    || normalizePublicOrigin(process.env.APP_URL, allowDevelopment);
}

export function publicOrigin() { return configuredPublicOrigin() || DEFAULT_PUBLIC_ORIGIN; }
