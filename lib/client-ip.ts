import { isIP } from "node:net";

// Header trust is deployment configuration, never a choice supplied by a request.
// Railway's HTTP edge overwrites X-Real-IP, including trusted Cloudflare traffic.
// Other deployments must overwrite their configured header and prevent bypass.
export function trustedClientIp(request: Request, configuredHeader = process.env.TRUSTED_CLIENT_IP_HEADER) {
  const railway = Boolean(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT_ID);
  const header = railway ? "x-real-ip" : configuredHeader?.trim().toLowerCase();
  if (!header || !["x-real-ip", "cf-connecting-ip", "x-forwarded-for"].includes(header)) return "unknown";
  const value = request.headers.get(header)?.trim() || "";
  // Require one address; do not guess which member of an unverified chain to trust.
  if (!value || value.includes("%") || !isIP(value)) return "unknown";
  if (isIP(value) === 4) return value;
  // URL serialization normalizes equivalent IPv6 representations to one bucket.
  const canonical = new URL('http://[' + value + ']/').hostname.slice(1, -1).toLowerCase();
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(canonical);
  if (mapped) {
    const high = Number.parseInt(mapped[1], 16), low = Number.parseInt(mapped[2], 16);
    return [high >>> 8, high & 255, low >>> 8, low & 255].join(".");
  }
  return canonical;
}
