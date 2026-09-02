import { timingSafeEqual } from "node:crypto";

function secretEquals(expected: string, actual: string) {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function validMachineSecret(value: string | undefined) {
  const secret = value?.trim() || "";
  return secret.length >= 32 && !/(?:replace[-_ ]?with|change[-_ ]?me|example[-_ ]?secret)/i.test(secret) ? secret : "";
}

export function jsonError(message: string, status = 400, code?: string) {
  return Response.json(code ? { ok: false, code, error: message } : { ok: false, error: message }, {
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
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

function requestHasSecret(request: Request, expected: string | undefined, directHeader: string) {
  const secret = validMachineSecret(expected);
  if (!secret) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const direct = request.headers.get(directHeader)?.trim();
  return Boolean((bearer && secretEquals(secret, bearer)) || (direct && secretEquals(secret, direct)));
}

export function isAdminRequest(request: Request) {
  return requestHasSecret(request, process.env.ADMIN_API_TOKEN, "x-admin-token");
}

export function isScheduledTaskRequest(request: Request) {
  return requestHasSecret(request, process.env.SCHEDULED_TASK_TOKEN, "x-scheduled-task-token");
}
