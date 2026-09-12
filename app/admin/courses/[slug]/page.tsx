import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { AdminCourseRoster } from "@/components/admin-course-roster";
export const metadata: Metadata = { title: "إدارة المادة والمشتركين | مراس", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function AdminCoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireRole(`/admin/courses/${encodeURIComponent(slug)}`, ["admin"]);
  return <AdminCourseRoster slug={slug} />;
}
