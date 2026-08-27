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

export function requestOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

export function isAdminRequest(request: Request) {
  const expected = process.env.ADMIN_API_TOKEN?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const direct = request.headers.get("x-admin-token")?.trim();
  return Boolean((bearer && secretEquals(expected, bearer)) || (direct && secretEquals(expected, direct)));
}
