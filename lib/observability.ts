const REQUEST_ID_HEADER = "x-request-id";
const SAFE_REQUEST_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,62}[A-Za-z0-9])?$/;

type HeaderRecord = Record<string, string | string[] | undefined>;
type LogValue = string | number | boolean | null | undefined;
type LogFields = Record<string, LogValue>;

function headerValue(headers: Headers | HeaderRecord, name: string) {
  if (headers instanceof Headers) return headers.get(name) || "";
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function safeRequestId(value: string) {
  const candidate = value.trim();
  return SAFE_REQUEST_ID.test(candidate) ? candidate : "";
}

export function requestIdFromHeaders(headers: Headers | HeaderRecord) {
  return safeRequestId(headerValue(headers, REQUEST_ID_HEADER));
}

export function ensureRequestId(headers: Headers | HeaderRecord) {
  return requestIdFromHeaders(headers) || crypto.randomUUID();
}

export function pathnameOnly(value: string) {
  try {
    return new URL(value, "http://observability.local").pathname;
  } catch {
    return "/unknown";
  }
}

export function logEvent(level: "info" | "warn" | "error", event: string, fields: LogFields = {}) {
  const entry: Record<string, LogValue> = {
    timestamp: new Date().toISOString(),
    level,
    service: "meras-alelm",
    event,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) entry[key] = value;
  }
  const serialized = JSON.stringify(entry);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.info(serialized);
}

export async function observeRequest(
  request: Request,
  operation: string,
  handler: (requestId: string) => Promise<Response>,
) {
  const requestId = ensureRequestId(request.headers);
  const startedAt = performance.now();
  try {
    const response = await handler(requestId);
    response.headers.set(REQUEST_ID_HEADER, requestId);
    logEvent(response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info", "http.request.completed", {
      requestId,
      operation,
      method: request.method,
      path: pathnameOnly(request.url),
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return response;
  } catch (error) {
    logEvent("error", "http.request.failed", {
      requestId,
      operation,
      method: request.method,
      path: pathnameOnly(request.url),
      durationMs: Math.round(performance.now() - startedAt),
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    throw error;
  }
}

export { REQUEST_ID_HEADER };
