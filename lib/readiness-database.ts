import type { ClientConfig, Pool, QueryConfig } from "pg";

/** Abort destroys the borrowed connection; a late acquisition is never queried. */
export async function checkDatabaseReadiness(pool: Pick<Pool, "connect">, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  const client = await pool.connect();
  let released = false;
  const release = (destroy = false) => {
    if (released) return;
    released = true;
    client.release(destroy);
  };
  const abort = () => release(true);
  try {
    if (signal.aborted) { release(true); return false; }
    signal.addEventListener("abort", abort, { once: true });
    // pg supports a per-query read timeout, but its QueryConfig declaration
    // omits that ClientConfig option. Keep both shapes checked without any casts.
    const query: QueryConfig & Pick<ClientConfig, "query_timeout"> = { text: "select 1", query_timeout: 2000 };
    await client.query(query);
    return !signal.aborted;
  } catch {
    release(true);
    return false;
  } finally {
    signal.removeEventListener("abort", abort);
    release();
  }
}
