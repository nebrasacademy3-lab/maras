import type { Metadata } from "next";
import { AdminLearningTracksCenter } from "@/components/admin-learning-tracks-center";
import { requireRole } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "إدارة المسارات القادمة | إدارة مراس",
  description: "إدارة ما سيظهر في واجهة مراس من مسارات ودورات قادمة وتنبيهات إطلاقها.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLearningTracksPage() {
  const user = await requireRole("/admin/learning-tracks", ["admin"]);
  return <AdminLearningTracksCenter adminName={user.fullName} />;
}
