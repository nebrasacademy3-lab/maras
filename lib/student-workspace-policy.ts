import type { SessionUser } from "@/lib/auth";
/** Instructor employment accounts use their own workspace; existing student/staff behavior is preserved. */
export function studentWorkspaceRequirementResponse(user: Pick<SessionUser, "role"> | null) {
 if (user?.role !== "instructor") return null;
 return Response.json({ ok: false, code: "STUDENT_WORKSPACE_REQUIRED", error: "هذه الخدمة لحساب الطالب. استخدم لوحة الشارح لإدارة عملك.", next: "/instructor" }, { status: 403, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
