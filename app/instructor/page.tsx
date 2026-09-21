import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { InstructorWorkspace } from "@/components/instructor-workspace";
import { currentUser } from "@/lib/server-auth";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "مساحة الشارح", robots: { index: false, follow: false } };
export default async function InstructorPage() {
  const user = await currentUser();
  if (!user) redirect("/login?return_to=%2Finstructor");
  if (user.role !== "instructor") redirect("/join-instructors");
  if (!user.emailVerified) redirect("/verify-email?return_to=%2Finstructor");
  return <main><SiteHeader appMode userRole={user.role} userName={user.fullName} /><div className="container"><InstructorWorkspace /></div><SiteFooter /></main>;
}
