import type { Pool } from "pg";

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
    await client.query({ text: "select 1", query_timeout: 2000 });
    return !signal.aborted;
  } catch {
    release(true);
    return false;
  } finally {
    signal.removeEventListener("abort", abort);
    release();
  }
}
