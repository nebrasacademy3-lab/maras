import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { AdminCourseAudience } from "@/components/admin-course-audience";
export const metadata: Metadata = { title: "المشتركون وتنبيهات المادة | إدارة مراس", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireRole(`/admin/courses/${encodeURIComponent(slug)}`, ["admin"]);
  return <AdminCourseAudience slug={slug} />;
}
