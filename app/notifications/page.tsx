import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { InstructorNotifications } from "@/components/instructor-notifications";
export const metadata: Metadata = { title: "الإشعارات", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Page() {
 const user = await currentUser();
 if (user?.role !== "instructor") redirect("/dashboard?view=notifications");
 return <main><SiteHeader appMode userRole={user.role} userName={user.fullName} /><div className="container"><InstructorNotifications key={user.id} userId={user.id} /></div><SiteFooter /></main>;
}
