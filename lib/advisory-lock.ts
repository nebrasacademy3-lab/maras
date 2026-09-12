import type { Pool } from "pg";

export async function withSessionAdvisoryLock<T>(pool: Pool, key: number, work: () => Promise<T>): Promise<T | null> {
  const client = await pool.connect();
  let acquired = false;
  let destroy = true; // Assume acquisition is uncertain until its query completes.
  try {
    const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [key]);
    acquired = result.rows[0]?.locked === true;
    destroy = false;
    return acquired ? await work() : null;
  } finally {
    if (acquired) {
      try {
        const result = await client.query<{ unlocked: boolean }>("SELECT pg_advisory_unlock($1) AS unlocked", [key]);
        destroy = result.rows[0]?.unlocked !== true;
      } catch { destroy = true; }
    }
    // A connection with an uncertain lock state must never return to the pool.
    client.release(destroy);
  }
}
