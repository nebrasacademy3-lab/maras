import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AccountDeletionRequest } from "@/components/account-deletion-request";
export const metadata: Metadata = { title: "حذف حساب مراس العلم وبياناته", description: "طلب حذف حساب مراس العلم من المتصفح دون تثبيت التطبيق، مع بيان البيانات المحذوفة والمستثناة من الحذف.", alternates: { canonical: "/account-deletion" } };
export default function AccountDeletionPage() {
  return <main lang="ar" dir="rtl"><SiteHeader/><section className="page-hero"><div className="container"><h1>حذف حساب مراس العلم وبياناته</h1><p>يمكنك تقديم الطلب من هذه الصفحة دون تثبيت التطبيق، أو من التطبيق: الحساب ← الأمان والخصوصية ← حذف الحساب.</p></div></section><section className="content-page"><div className="container" style={{ display: "grid", gap: 24, paddingBlock: 32 }}>
    <article><h2>ما أثر الحذف؟</h2><p>ينهي الحذف جلسات الحساب والوصول إليه، ويزيل بياناته الشخصية غير المطلوب الاحتفاظ بها، والأجهزة والمفضلة والملاحظات والتقدم والمحادثات وملفات الدعم والملفات الخاصة التابعة له. قد تبقى السجلات المالية والعقود الموقعة وحقوق المحتوى وسجلات التدقيق اللازمة للالتزامات النظامية وتسوية النزاعات وفق سياسة الاحتفاظ؛ لا تُستخدم لاستعادة الحساب المحذوف. تُزال الملفات المخزنة عبر مهام التنظيف الآمنة، وليس بالضرورة في لحظة إغلاق الصفحة.</p><p>راجع <Link href="/privacy#retention">سياسة الخصوصية والاحتفاظ بالبيانات</Link>. وللمساعدة في الوصول إلى بريدك أو معالجة طلب خصوصية، استخدم <Link href="/contact">قنوات التواصل الرسمية</Link>.</p></article>
    <AccountDeletionRequest/>
  </div></section><SiteFooter/></main>;
}
