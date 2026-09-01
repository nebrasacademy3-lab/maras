"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, Gift, RefreshCw, Share2, ShieldCheck, Sparkles, TicketPercent, Trophy, UsersRound } from "lucide-react";
import styles from "./referrals-center.module.css";

type ReferralData = {
  program: { enabled: boolean; title: string; description: string; qualificationLabel: string; terms: string };
  referral: { code: string; shareUrl: string; shareCount: number; counts: { total: number; pending: number; qualified: number; rejected: number }; progressPercent: number; nextTier: null | { name: string; requiredReferrals: number; remaining: number; rewardLabel: string } };
  tiers: Array<{ id: number; name: string; description: string; requiredReferrals: number; rewardLabel: string; earned: boolean }>;
  rewards: Array<{ id: number; type: string; title: string; sourceType: string; status: string; issuedAt: string; expiresAt: string | null; note: string | null; coupon: null | { code: string; status: string } }>;
  coupons: Array<{ id: number; code: string; title: string | null; type: string; value: number; courseSlug: string | null; status: string; used: boolean; expiresAt: string | null }>;
};

const statusLabels: Record<string, string> = { active: "جاهزة للاستخدام", redeemed: "مستخدمة", used: "مستخدمة", expired: "منتهية", disabled: "موقوفة", scheduled: "تبدأ قريبًا", pending: "قيد المراجعة" };

function formatDate(value: string | null) {
  if (!value) return "بلا تاريخ انتهاء";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(value));
}

export function ReferralsCenter() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/referrals", { credentials: "same-origin", cache: "no-store" });
      const result = await response.json() as ReferralData & { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تحميل الإحالات والهدايا");
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الإحالات والهدايا");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const copy = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1_800);
  };

  const share = async () => {
    if (!data) return;
    const nativeShare = (navigator as Navigator & { share?: (input: ShareData) => Promise<void> }).share;
    void fetch("/api/referrals", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "track_share", channel: typeof nativeShare === "function" ? "native" : "copy" }) });
    if (typeof nativeShare === "function") {
      try { await nativeShare.call(navigator, { title: "انضم إلى مراس", text: "ابدأ رحلتك الجامعية مع مراس من رابط دعوتي", url: data.referral.shareUrl }); return; } catch { /* The user may cancel the native sheet. */ }
    }
    await copy(data.referral.shareUrl, "link");
  };

  const progressText = useMemo(() => data?.referral.nextTier
    ? `باقي ${data.referral.nextTier.remaining} للوصول إلى ${data.referral.nextTier.rewardLabel}`
    : "أنجزت جميع المستويات المتاحة حاليًا", [data]);

  if (loading) return <div className={styles.loading}><span /><span /><span /></div>;
  if (error || !data) return <section className={styles.error}><Gift /><h1>تعذر فتح هداياك</h1><p>{error}</p><button onClick={load}><RefreshCw size={17} /> المحاولة مجددًا</button></section>;

  return <main className={styles.page} dir="rtl">
    <section className={styles.hero}>
      <div className={styles.heroGlow} />
      <div className={styles.heroContent}>
        <span className={styles.eyebrow}><Sparkles size={16} /> الإحالات والهدايا</span>
        <h1>{data.program.title}</h1>
        <p>{data.program.description}</p>
        <div className={styles.shareBox}>
          <div><small>رابطك الشخصي</small><strong dir="ltr">{data.referral.shareUrl}</strong></div>
          <button onClick={share}><Share2 size={18} /> مشاركة الرابط</button>
          <button className={styles.copyButton} onClick={() => copy(data.referral.shareUrl, "link")} aria-label="نسخ رابط الإحالة">{copied === "link" ? <Check size={18} /> : <Copy size={18} />}</button>
        </div>
      </div>
      <div className={styles.progressCard}>
        <div className={styles.progressRing} style={{ "--progress": `${data.referral.progressPercent * 3.6}deg` } as React.CSSProperties}><span><b>{data.referral.counts.qualified}</b><small>إحالة مؤهلة</small></span></div>
        <strong>{progressText}</strong>
        <div className={styles.miniStats}><span><b>{data.referral.counts.pending}</b> قيد المراجعة</span><span><b>{data.referral.shareCount}</b> مشاركة</span></div>
      </div>
    </section>

    {!data.program.enabled && <div className={styles.paused}><ShieldCheck size={20} /><div><strong>برنامج الإحالات متوقف مؤقتًا</strong><p>تظل هداياك السابقة محفوظة، ولن تُحتسب إحالات جديدة حتى إعادة تفعيله.</p></div></div>}

    <section className={styles.section}>
      <header><div><span>مسارك</span><h2>كل دعوة تقرّبك من هدية</h2></div><p>{data.program.qualificationLabel}</p></header>
      <div className={styles.tiers}>{data.tiers.map((tier, index) => <article key={tier.id} className={tier.earned ? styles.earnedTier : ""}>
        <div className={styles.tierNumber}>{tier.earned ? <Check size={19} /> : index + 1}</div>
        <span>{tier.requiredReferrals} إحالات مؤهلة</span>
        <h3>{tier.name}</h3>
        <strong><Trophy size={18} /> {tier.rewardLabel}</strong>
        <p>{tier.description}</p>
        <small>{tier.earned ? "تم إصدار الهدية إلى حسابك" : "تُصدر تلقائيًا عند اكتمال العدد"}</small>
      </article>)}</div>
    </section>

    <section className={styles.section}>
      <header><div><span>محفظتي</span><h2>الكوبونات والهدايا الخاصة بك</h2></div><Link href="/cart">استخدم كوبونًا في السلة</Link></header>
      {data.coupons.length ? <div className={styles.coupons}>{data.coupons.map((coupon) => <article key={coupon.id} className={`${styles.coupon} ${styles[`coupon_${coupon.status}`] || ""}`}>
        <div className={styles.couponCut} />
        <div className={styles.couponIcon}><TicketPercent /></div>
        <div className={styles.couponMain}><span>{coupon.title || "هدية مراس"}</span><h3>{coupon.type === "percent" ? `${coupon.value}% خصم` : `${coupon.value} ر.س خصم`}</h3><p>{coupon.courseSlug ? `صالح لمادة ${coupon.courseSlug}` : "صالح لأي مادة متاحة للشراء"}</p><small>الصلاحية: {formatDate(coupon.expiresAt)}</small></div>
        <div className={styles.couponCode}><small>{statusLabels[coupon.status] || coupon.status}</small><strong dir="ltr">{coupon.code}</strong><button disabled={coupon.status !== "active"} onClick={() => copy(coupon.code, `coupon-${coupon.id}`)}>{copied === `coupon-${coupon.id}` ? <Check size={16} /> : <Copy size={16} />} نسخ الكود</button></div>
      </article>)}</div> : <div className={styles.empty}><Gift size={28} /><h3>هديتك الأولى قريبة</h3><p>شارك رابطك، وعندما تكتمل الإحالات المطلوبة سيظهر الكوبون هنا تلقائيًا.</p></div>}
    </section>

    <section className={styles.explain}>
      <div><UsersRound /><span><b>1</b><strong>شارك رابطك</strong><p>أرسله لأصدقائك المهتمين بالدراسة عبر مراس.</p></span></div>
      <div><ShieldCheck /><span><b>2</b><strong>نؤهل التسجيل الحقيقي</strong><p>نحمي البرنامج من الحسابات المكررة ونوضح لك الحالات.</p></span></div>
      <div><Gift /><span><b>3</b><strong>تصلك الهدية تلقائيًا</strong><p>الكوبون خاص بحسابك، ويصلك إشعار فور إصداره.</p></span></div>
    </section>
    <p className={styles.terms}><ShieldCheck size={16} /> {data.program.terms}</p>
  </main>;
}
