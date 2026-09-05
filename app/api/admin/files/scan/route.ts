import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { courseRequestFiles, courseResources, supportReplyFiles } from "@/db/schema";
import { isScheduledTaskRequest, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { scanColumns, scanStoredFile } from "@/lib/file-security";
import { observeRequest } from "@/lib/observability";

export async function POST(request: Request) {
  return observeRequest(request, "files.scan", async () => {
    const machine = isScheduledTaskRequest(request);
    const user = machine ? null : await getSessionUser(request);
    if (!machine && (!roleAllowed(user, ["admin"]) || !sameOriginRequest(request))) return jsonError("غير مصرح بتشغيل فحص المرفقات", 403);
    const identity = machine ? `machine:${clientIp(request)}` : `user:${user!.id}`;
    if (!await checkRateLimit("file-scan", identity, 4, 60)) return jsonError("تم تشغيل الفحص مؤخرًا", 429);
    const db = getDb();
    const [requests, support, resources] = await Promise.all([
      db.select().from(courseRequestFiles).where(eq(courseRequestFiles.scanStatus, "pending")).orderBy(asc(courseRequestFiles.createdAt)).limit(30),
      db.select().from(supportReplyFiles).where(eq(supportReplyFiles.scanStatus, "pending")).orderBy(asc(supportReplyFiles.createdAt)).limit(30),
      db.select().from(courseResources).where(eq(courseResources.scanStatus, "pending")).orderBy(asc(courseResources.createdAt)).limit(30),
    ]);
    const summary = { scanned: 0, clean: 0, quarantined: 0, pending: 0 };
    for (const row of requests) {
      const result = await scanStoredFile(row);
      await db.update(courseRequestFiles).set(scanColumns(result)).where(eq(courseRequestFiles.id, row.id));
      summary.scanned += 1; summary[result.status] += 1;
    }
    for (const row of support) {
      const result = await scanStoredFile(row);
      await db.update(supportReplyFiles).set(scanColumns(result)).where(eq(supportReplyFiles.id, row.id));
      summary.scanned += 1; summary[result.status] += 1;
    }
    for (const row of resources) {
      const result = await scanStoredFile(row);
      await db.update(courseResources).set({
        ...scanColumns(result),
        studentVisible: result.status === "clean" ? row.studentVisible : false,
        status: result.status === "quarantined" ? "archived" : row.status,
        updatedAt: new Date().toISOString(),
      }).where(eq(courseResources.id, row.id));
      summary.scanned += 1; summary[result.status] += 1;
    }
    return Response.json({ ok: true, summary, completedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  });
}
