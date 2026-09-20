import assert from "node:assert/strict";
/** In-memory queue boundary for parent-deletion tests. The actual SQL leasing,
 * durability, fencing and recovery are exercised against PostgreSQL by QA. */
export function cleanupFixture(h, remove) {
  return {
    async enqueueStorageCleanupTx(tx, targets) {
      assert.equal(h.inTransaction(), true, "cleanup must be enqueued within the parent transaction");
      const unique = [...new Map(targets.map(t => [JSON.stringify([t.provider || "local", !!t.recursive, t.key]), t])).values()];
      if (!unique.length) return [];
      const rows = await tx.insert(h.tables.storageCleanupJobs).values(unique.map(t => ({ ...t, id: crypto.randomUUID(), provider: t.provider || "local", status: "pending" }))).returning();
      return rows.map(row => row.id);
    },
    async processStorageCleanupBatch(_db, { jobIds, limit, signal }) {
      assert.equal(h.inTransaction(), false); assert.equal(h.committed(), true);
      const jobs = h.rows.storageCleanupJobs.filter(row => jobIds.includes(row.id) && row.status === "pending").slice(0, limit);
      const result = { claimed: jobs.length, completed: 0, failed: [], lost: 0 };
      await Promise.all(jobs.map(async row => {
        signal?.throwIfAborted();
        try { await remove(row.recursive ? "prefix" : "object", row.key, row.provider); row.status = "completed"; result.completed++; }
        catch { result.failed.push(row); }
      }));
      return result;
    },
  };
}
