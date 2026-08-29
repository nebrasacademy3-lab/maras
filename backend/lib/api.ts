import { timingSafeEqual } from "node:crypto";

function secretEquals(expected: string, actual: string) {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizePhone(value: unknown) {
  return cleanText(value, 20).replace(/[^0-9+]/g, "");
}

export function isUniqueConstraintError(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth += 1) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function requestOrigin(request: Request) {
  for (const configured of [process.env.APP_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    if (!configured) continue;
    try {
      const url = new URL(configured);
      if (process.env.NODE_ENV === "production" && url.protocol !== "https:") continue;
      return url.origin;
    } catch { /* Try the next explicitly configured origin. */ }
  }
  // Never build payment callbacks or password-reset links from an untrusted
  // Host header in production.
  if (process.env.NODE_ENV === "production") return "";
  try { return new URL(request.url).origin; } catch { return ""; }
}

export function isAdminRequest(request: Request) {
  const expected = process.env.ADMIN_API_TOKEN?.trim();
  if (!expected || expected.length < 32) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const direct = request.headers.get("x-admin-token")?.trim();
  return Boolean((bearer && secretEquals(expected, bearer)) || (direct && secretEquals(expected, direct)));
}
