import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { SiteHeader } from "./site-header";
import { BrandLockup } from "./brand-logo";

export function SecurityAuthShell({ children, mode }: { children: ReactNode; mode: "verify" | "recovery" }) {
  const verification = mode === "verify";
  return <main className="security-page"><SiteHeader /><div className="security-layout container"><aside className="security-story"><span className="eyebrow"><ShieldCheck size={16} /> حسابك، باهتمام مراس</span><h2>{verification ? <>خطوة صغيرة.<br /><em>ورحلة تستحق.</em></> : <>نرجعك إلى تعلّمك.<br /><em>بخطوات مطمئنة.</em></>}</h2><p>{verification ? "أكمل تأكيد بريدك، ثم تابع موادك وطلباتك من حساب واحد، أينما كنت." : "استعد الوصول إلى حسابك دون فقدان موادك أو تقدمك. سنرشدك في كل خطوة."}</p><div className="security-orbit" aria-hidden="true"><span className="security-orbit-line" /><span className="security-orbit-line second" /><div className="security-orbit-logo"><BrandLockup markOnly /></div><i className="security-orbit-badge one"><KeyRound size={23} /></i><i className="security-orbit-badge two"><Sparkles size={24} /></i><i className="security-orbit-badge three"><CheckCircle2 size={24} /></i></div><div className="security-story-note"><ShieldCheck size={19} /><span>الرموز وروابط الاستعادة مؤقتة.<br /><strong>لا تشاركها مع أي شخص.</strong></span></div></aside><section className="security-surface" aria-label={verification ? "تأكيد البريد" : "استعادة الحساب"}><Link className="security-back" href={verification ? "/courses" : "/login"}><ArrowRight size={16} />{verification ? "العودة إلى المواد" : "العودة لتسجيل الدخول"}</Link>{children}<div className="security-help">تحتاج مساعدة؟ <Link href="/contact">تواصل مع فريق مراس</Link></div></section></div></main>;
}
