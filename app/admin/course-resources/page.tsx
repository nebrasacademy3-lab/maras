import type { Metadata } from "next";
import { AdminCourseResourcesCenter } from "@/components/admin-course-resources-center";
import { requireRole } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "ملفات المواد ونطاق الظهور | إدارة مراس",
  description: "رفع ملفات المواد وضبط ظهورها ونطاق إتاحتها للطلاب.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminCourseResourcesPage() {
  const user = await requireRole("/admin/course-resources", ["admin"]);
  return <AdminCourseResourcesCenter adminName={user.fullName} />;
}
