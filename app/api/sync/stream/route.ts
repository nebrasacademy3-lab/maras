import { clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { acquireSyncConnection } from "@/lib/sync-guard";
import { subscribeSyncNotifications } from "@/lib/sync-listener";
import { syncChannelsForUser } from "@/lib/sync-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("طلب غير مسموح", 403);
  const user = await getSessionUser(request);
  const releaseConnection = acquireSyncConnection(`${user?.id || "public"}:${clientIp(request)}`, user ? 5 : 100);
  if (!releaseConnection) return jsonError("عدد اتصالات التحديث الفوري كبير", 429);

  const allowed = new Set(syncChannelsForUser(user));
  const encoder = new TextEncoder();
  let cleanup = releaseConnection;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let close = () => {};
      const send = (body: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(body)); } catch { close(); }
      };
      const unsubscribe = subscribeSyncNotifications((channel) => {
        if (allowed.has(channel)) send(`event: change\ndata: ${JSON.stringify({ channel })}\n\n`);
      });
      const heartbeat = setInterval(() => send(`: heartbeat ${Date.now()}\n\n`), 20_000);
      close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", close);
        releaseConnection();
        try { controller.close(); } catch { /* Stream is already closed. */ }
      };
      cleanup = close;
      request.signal.addEventListener("abort", close, { once: true });
      send(`retry: 3000\nevent: ready\ndata: {"ok":true}\n\n`);
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-store, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
      "x-content-type-options": "nosniff",
    },
  });
}
