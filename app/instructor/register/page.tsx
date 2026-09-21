import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { InstructorRegistration } from "@/components/instructor-registration";
import { currentUser } from "@/lib/server-auth";
import styles from "@/components/instructor-workspace.module.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "إنشاء حساب شارح", robots: { index: false, follow: false } };
export default async function InstructorRegisterPage() {
  const user = await currentUser();
  if (user?.role === "instructor") redirect("/instructor");
  return <main><SiteHeader /><div className={`container ${styles.registration}`}><div className={styles.pageHeading}><Link href="/join-instructors">فريق مراس للشرح والتعليم</Link><h1>معرفتك تستحق أن تصل.</h1><p>أنشئ حسابك، وعرّفنا بخبرتك، وابدأ طلب الانضمام إلى فريق مراس.</p></div><InstructorRegistration /></div><SiteFooter /></main>;
}
