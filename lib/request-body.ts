export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("حجم الطلب أكبر من المسموح");
    this.name = "RequestBodyTooLargeError";
  }
}

// Count actual bytes, including chunked bodies and multipart overhead. A client
// supplied Content-Length is only an early rejection, never the size limit.
export function boundedRequestBody(request: Request, maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RangeError("Invalid request body limit");
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) {
    void request.body?.cancel().catch(() => undefined);
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) return null;
  let received = 0;
  return request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > maxBytes) throw new RequestBodyTooLargeError();
      controller.enqueue(chunk);
    },
  }));
}

export async function readBoundedFormData(request: Request, maxBytes: number) {
  const body = boundedRequestBody(request, maxBytes);
  return new Response(body, { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
}

export async function readBoundedJsonObject(request: Request, maxBytes = 16 * 1024): Promise<Record<string, unknown>> {
  const value: unknown = await new Response(boundedRequestBody(request, maxBytes)).json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid JSON object");
  return value as Record<string, unknown>;
}
