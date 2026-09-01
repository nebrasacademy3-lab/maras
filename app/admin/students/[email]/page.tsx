import type { Metadata } from "next";
import { Student360 } from "@/components/student-360";
import { requireRole } from "@/lib/server-auth";

type Props = { params: Promise<{ email: string }> };

export const metadata: Metadata = {
  title: "ملف الطالب 360 | إدارة مراس",
  description: "عرض إداري موحّد للاشتراكات والطلبات والتقدم والدعم والجلسات.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function StudentProfilePage({ params }: Props) {
  const { email } = await params;
  await requireRole(`/admin/students/${encodeURIComponent(email)}`, ["admin"]);
  return <Student360 email={email} />;
}
