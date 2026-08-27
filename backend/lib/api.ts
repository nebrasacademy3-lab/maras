export function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
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
  const expected = (process.env.ADMIN_API_TOKEN || process.env.ADMIN_UPLOAD_TOKEN)?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const direct = request.headers.get("x-admin-token")?.trim();
  return bearer === expected || direct === expected;
}
