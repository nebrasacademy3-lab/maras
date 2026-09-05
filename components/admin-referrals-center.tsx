"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleDollarSign, Gift, LoaderCircle, RefreshCw, Save, Search, ShieldAlert, Sparkles, TicketPercent, UsersRound } from "lucide-react";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { ADMIN_STEP_UP_MESSAGE, AdminMfaNotice, isAdminStepUpMessage, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import { useRealtimeSync } from "@/components/realtime-sync";
import styles from "./admin-referrals-center.module.css";

type Tier = { id: number; name: string; description: string; requiredReferrals: number; rewardType: string; rewardValue: number; rewardDurationDays: number | null; couponValidityDays: number | null; courseSlug: string | null; enabled: boolean; sortOrder: number; rewardLabel: string };
type AdminData = {
  settings: { enabled: boolean; qualificationEvent: string; title: string; description: string; terms: string; maxQualifiedPerIpPerDay: number; defaultCouponValidityDays: number };
  stats: { students: number; qualified: number; pending: number; rejected: number; rewards: number; activeCoupons: number; usedCoupons: number };
  tiers: Tier[];
  students: Array<{ userId: number; email: string; fullName: string; status: string; code: string | null; shareCount: number; counts: { total: number; qualified: number; pending: number; rejected: number }; nextTier: null | { name: string; remaining: number } }>;
  attributions: Array<{ id: number; referrer: { id: number; email: string; fullName: string }; referred: { id: number; email: string; fullName: string }; status: string; qualificationEvent: string; reviewReason: string | null; createdAt: string; qualifiedAt: string | null }>;
  rewards: Array<{ id: number; user: { id: number; email: string; fullName: string }; rewardType: string; rewardValue: number; rewardLabel: string; sourceType: string; status: string; coupon: null | { id: number; code: string; status: string; usedCount: number; courseSlug?: string | null }; issuedAt: string; expiresAt: string | null; note: string | null }>;
  pagination?: { page: number; limit: number; total: number; hasMore: boolean };
};

type Tab = "overview" | "tiers" | "students" | "rewards" | "review";
const rewardTypes = [{ value: "coupon_percent", label: "كوبون نسبة خصم" }, { value: "coupon_fixed", label: "كوبون مبلغ ثابت" }, { value: "ai_subscription", label: "اشتراك أدوات مراس" }];
const statusLabel: Record<string, string> = { active: "مفعلة", disabled: "موقوفة", redeemed: "مستخدمة", qualified: "مؤهلة", pending: "قيد المراجعة", rejected: "مرفوضة" };

function date(value: string | null) { return value ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(value)) : "—"; }
function formValue(form: FormData, key: string) { return String(form.get(key) || "").trim(); }

export function AdminReferralsCenter({ adminName, initialSearch = "", initialTab }: { adminName: string; initialSearch?: string; initialTab?: string }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab === "tiers" || initialTab === "students" || initialTab === "rewards" || initialTab === "review" ? initialTab : initialSearch ? "students" : "overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const searchRef = useRef(search);
  const lastLoad = useRef(0);

  useEffect(() => { searchRef.current = search; }, [search]);

  const load = useCallback(async (options: { page?: number; append?: boolean; silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    setError("");
    lastLoad.current = Date.now();
    try {
      const query = searchRef.current;
      const nextPage = options.page || 1;
      const params = new URLSearchParams();
      if (query) params.set("search", query);
      if (nextPage > 1) params.set("page", String(nextPage));
      const response = await fetch(`/api/admin/referrals${params.size ? `?${params}` : ""}`, { cache: "no-store", credentials: "same-origin" });
      const result = await response.json() as AdminData & { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تحميل مركز الإحالات");
      setPage(nextPage);
      setData((current) => options.append && current ? { ...result, students: [...current.students, ...result.students] } : result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر تحميل مركز الإحالات"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useRealtimeSync((payload) => {
    if (payload.changed && !payload.changed.includes("admin")) return;
    if (Date.now() - lastLoad.current < 5000) return;
    void load({ silent: true });
  });

  const mutate = async (key: string, method: "POST" | "PATCH", body: Record<string, unknown>) => {
    setBusy(key); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/referrals", { method, credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
      if (!response.ok) throw new Error(result.error || "تعذر حفظ التغييرات");
      setMessage("تم حفظ التغييرات بنجاح");
      await load({ silent: true });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر حفظ التغييرات"); }
    finally { setBusy(""); }
  };

  if (loading && !data) return <div className={styles.loading}><LoaderCircle /><span>نجمع بيانات الإحالات والهدايا...</span></div>;
  if (!data) return <div className={styles.failure}><ShieldAlert /><h1>تعذر فتح المركز</h1><p>{error}</p><button onClick={() => void load()}><RefreshCw /> المحاولة مجددًا</button></div>;

  const statCards = [
    ["الطلاب في البرنامج", data.stats.students, UsersRound], ["إحالات مؤهلة", data.stats.qualified, CheckCircle2], ["تحتاج مراجعة", data.stats.pending, ShieldAlert],
    ["هدايا صادرة", data.stats.rewards, Gift], ["كوبونات نشطة", data.stats.activeCoupons, TicketPercent], ["كوبونات مستخدمة", data.stats.usedCoupons, CircleDollarSign],
  ] as const;

  return <main className={styles.page} dir="rtl">
    <AdminCenterNav />
    <header className={styles.topbar}>
      <div><span>مرحبًا، {adminName}</span><h1>الإحالات والهدايا</h1><p>تحكم بالمستويات، راجع الحالات، وامنح كوبونات واشتراكات خاصة من مركز واحد.</p></div>
      <div className={styles.headerActions}><button type="button" onClick={() => void load({ silent: true })} disabled={loading}><RefreshCw className={loading ? styles.spin : ""} /> تحديث</button><button onClick={() => mutate("reconcile", "POST", { action: "reconcile" })} disabled={Boolean(busy)}>{busy === "reconcile" ? <LoaderCircle className={styles.spin} /> : <RefreshCw />} مطابقة وإصدار المستحقات</button></div>
    </header>
    <nav className={styles.tabs}>{([['overview','نظرة عامة'],['tiers','المستويات'],['students','الطلاب'],['rewards','الهدايا والكوبونات'],['review','مراجعة الحالات']] as [Tab,string][]).map(([key,label]) => <button key={key} className={tab === key ? styles.activeTab : ""} onClick={() => setTab(key)}>{label}{key === "review" && data.stats.pending > 0 ? <b>{data.stats.pending}</b> : null}</button>)}</nav>
    {error && isAdminStepUpMessage(error) ? <AdminMfaNotice /> : (message || error) ? <div className={error ? styles.error : styles.success}>{error || message}</div> : null}

    {tab === "overview" && <>
      <section className={styles.stats}>{statCards.map(([label,value,Icon]) => <article key={label}><Icon /><span>{label}</span><strong>{value.toLocaleString("ar-SA")}</strong></article>)}</section>
      <section className={styles.grid}>
        <form className={styles.panel} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void mutate("settings", "PATCH", { action: "settings", enabled: form.get("enabled") === "on", qualificationEvent: formValue(form,"qualificationEvent"), title: formValue(form,"title"), description: formValue(form,"description"), terms: formValue(form,"terms"), maxQualifiedPerIpPerDay: Number(formValue(form,"maxQualifiedPerIpPerDay")), defaultCouponValidityDays: Number(formValue(form,"defaultCouponValidityDays")) }); }}>
          <header><div><span>إعدادات البرنامج</span><h2>السياسة والتأهيل</h2></div><label className={styles.switch}><input name="enabled" type="checkbox" defaultChecked={data.settings.enabled} /><i /></label></header>
          <label>عنوان صفحة الطالب<input name="title" defaultValue={data.settings.title} required /></label>
          <label>الوصف<textarea name="description" defaultValue={data.settings.description} rows={3} /></label>
          <div className={styles.two}><label>متى تتأهل الإحالة؟<select name="qualificationEvent" defaultValue={data.settings.qualificationEvent}><option value="first_paid_order">بعد أول اشتراك مدفوع — موصى به</option><option value="registration">عند التسجيل — يحتاج مراجعة أدق</option></select></label><label>حد التأهيل لنفس الشبكة يوميًا<input name="maxQualifiedPerIpPerDay" type="number" min="1" max="100" defaultValue={data.settings.maxQualifiedPerIpPerDay} /></label></div>
          <p className={styles.riskNote}>التأهيل بعد أول اشتراك ناجح هو الإعداد الأكثر أمانًا. اختيار التسجيل يجعل الحالات المتكررة وإشارات الجهاز والشبكة معلّقة للمراجعة قبل منح الهدية.</p>
          <label>صلاحية الكوبون الافتراضية بالأيام<input name="defaultCouponValidityDays" type="number" min="1" max="730" defaultValue={data.settings.defaultCouponValidityDays} /></label>
          <label>الشروط الموضحة للطالب<textarea name="terms" defaultValue={data.settings.terms} rows={4} /></label>
          <button className={styles.primary} disabled={Boolean(busy)}>{busy === "settings" ? <LoaderCircle className={styles.spin} /> : <Save />} حفظ الإعدادات</button>
        </form>
        <form className={`${styles.panel} ${styles.giftPanel}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void mutate("gift", "POST", { action: "grant_reward", email: formValue(form,"email"), rewardType: formValue(form,"rewardType"), rewardValue: Number(formValue(form,"rewardValue")), validityDays: formValue(form,"validityDays") ? Number(formValue(form,"validityDays")) : null, courseSlug: formValue(form,"courseSlug"), title: formValue(form,"title"), note: formValue(form,"note") }); }}>
          <header><div><span>هدية مباشرة</span><h2>امنح طالبًا مكافأة خاصة</h2></div><Gift /></header>
          <label>بريد الطالب<input name="email" type="email" required placeholder="student@example.com" dir="ltr" /></label>
          <div className={styles.two}><label>نوع الهدية<select name="rewardType">{rewardTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>القيمة / عدد الأشهر<input name="rewardValue" type="number" min="1" step="1" defaultValue="25" /></label></div>
          <div className={styles.two}><label>الصلاحية بالأيام<input name="validityDays" type="number" min="1" max="730" defaultValue="90" /></label><label>مادة محددة (اختياري)<input name="courseSlug" dir="ltr" placeholder="course-slug" /></label></div>
          <label>اسم الهدية<input name="title" placeholder="هدية خاصة من مراس" /></label><label>ملاحظة داخلية<textarea name="note" rows={3} /></label>
          <button className={styles.primary} disabled={Boolean(busy)}>{busy === "gift" ? <LoaderCircle className={styles.spin} /> : <Sparkles />} إصدار الهدية وإرسال الإشعار</button>
        </form>
      </section>
    </>}

    {tab === "tiers" && <section className={styles.tierLayout}>
      <TierForm busy={busy === "new-tier"} onSubmit={(value) => mutate("new-tier", "POST", { action: "create_tier", tier: value })} />
      <div className={styles.tierList}>{data.tiers.map((tier) => <TierForm key={tier.id} tier={tier} busy={busy === `tier-${tier.id}`} onSubmit={(value) => mutate(`tier-${tier.id}`, "PATCH", { action: "tier", id: tier.id, ...value })} />)}</div>
    </section>}

    {tab === "students" && <section className={styles.tablePanel}><header><div><span>كل طالب وحالته</span><h2>متابعة التقدم والإحالات</h2></div><form onSubmit={(event) => { event.preventDefault(); void load(); }}><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو البريد أو الكود" /><button>بحث</button></form></header><div className={styles.tableScroll}><table><thead><tr><th>الطالب</th><th>الكود</th><th>المؤهلة</th><th>قيد المراجعة</th><th>المرفوضة</th><th>الهدية التالية</th><th /></tr></thead><tbody>{data.students.map((student) => <tr key={student.userId}><td><strong>{student.fullName}</strong><small dir="ltr">{student.email}</small></td><td><code>{student.code || "—"}</code><small>{student.shareCount} مشاركة</small></td><td><b className={styles.good}>{student.counts.qualified}</b></td><td>{student.counts.pending}</td><td>{student.counts.rejected}</td><td>{student.nextTier ? <><strong>{student.nextTier.name}</strong><small>باقي {student.nextTier.remaining}</small></> : "مكتملة"}</td><td><button onClick={() => mutate(`reconcile-${student.userId}`, "POST", { action: "reconcile", userId: student.userId })}>مطابقة</button></td></tr>)}</tbody></table></div>{data.students.length === 0 && <p className={styles.empty}>لا يوجد طلاب مطابقون لهذا البحث.</p>}{data.pagination?.hasMore && <div className={styles.loadMore}><button type="button" disabled={loading} onClick={() => void load({ page: page + 1, append: true, silent: true })}>{loading ? <LoaderCircle className={styles.spin} /> : null} تحميل المزيد ({data.students.length.toLocaleString("ar-SA")} من {data.pagination.total.toLocaleString("ar-SA")})</button></div>}</section>}

    {tab === "rewards" && <section className={styles.tablePanel}><header><div><span>سجل مالي وتسويقي</span><h2>الهدايا والكوبونات المملوكة</h2></div></header><div className={styles.tableScroll}><table><thead><tr><th>الطالب</th><th>الهدية</th><th>المصدر</th><th>الكوبون</th><th>الحالة</th><th>الصلاحية</th><th /></tr></thead><tbody>{data.rewards.map((reward) => <tr key={reward.id}><td><strong>{reward.user.fullName}</strong><small dir="ltr">{reward.user.email}</small></td><td><strong>{reward.rewardLabel}</strong><small>{reward.note}</small></td><td>{reward.sourceType === "admin_gift" ? "هدية إدارية" : "مستوى إحالة"}</td><td><code>{reward.coupon?.code || "اشتراك رقمي"}</code>{reward.coupon && <small>استخدم {reward.coupon.usedCount} مرة{reward.coupon.courseSlug ? ` · مخصص للمادة ${reward.coupon.courseSlug}` : " · كل المواد"}{reward.coupon.status !== reward.status ? ` · الكوبون ${statusLabel[reward.coupon.status] || reward.coupon.status}` : ""}</small>}</td><td><span className={`${styles.badge} ${styles[`badge_${reward.status}`] || ""}`}>{statusLabel[reward.status] || reward.status}</span></td><td>{date(reward.expiresAt)}</td><td><div className={styles.actions}>{!["redeemed", "expired"].includes(reward.status) && <button onClick={() => mutate(`reward-${reward.id}`, "PATCH", { action: "reward_status", id: reward.id, status: reward.status === "disabled" ? "active" : "disabled" })}>{reward.status === "disabled" ? "تفعيل" : "إيقاف"}</button>}{reward.coupon && reward.coupon.usedCount === 0 && reward.coupon.status !== reward.status && <button onClick={() => mutate(`coupon-${reward.coupon!.id}`, "PATCH", { action: "coupon_status", id: reward.coupon!.id, status: reward.coupon!.status === "disabled" ? "active" : "disabled" })}>{reward.coupon.status === "disabled" ? "تفعيل الكوبون" : "إيقاف الكوبون"}</button>}</div></td></tr>)}</tbody></table></div>{data.rewards.length === 0 && <p className={styles.empty}>لم تصدر هدايا بعد.</p>}</section>}

    {tab === "review" && <section className={styles.tablePanel}><header><div><span>مكافحة إساءة الاستخدام</span><h2>مراجعة حالات الإحالة</h2></div></header><div className={styles.tableScroll}><table><thead><tr><th>صاحب الرابط</th><th>الطالب المُحال</th><th>وقت التسجيل</th><th>سبب المراجعة</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{data.attributions.map((item) => <tr key={item.id}><td><strong>{item.referrer.fullName}</strong><small dir="ltr">{item.referrer.email}</small></td><td><strong>{item.referred.fullName}</strong><small dir="ltr">{item.referred.email}</small></td><td>{date(item.createdAt)}</td><td><code>{item.reviewReason || "لا يوجد"}</code></td><td><span className={`${styles.badge} ${styles[`badge_${item.status}`] || ""}`}>{statusLabel[item.status] || item.status}</span></td><td><div className={styles.actions}><button onClick={() => mutate(`attr-${item.id}`, "PATCH", { action: "attribution_status", id: item.id, status: "qualified", reviewReason: "approved_by_admin" })}>تأهيل</button><button onClick={() => mutate(`attr-${item.id}`, "PATCH", { action: "attribution_status", id: item.id, status: "rejected", reviewReason: "rejected_by_admin" })}>رفض</button></div></td></tr>)}</tbody></table></div></section>}
  </main>;
}

function TierForm({ tier, busy, onSubmit }: { tier?: Tier; busy: boolean; onSubmit: (value: Record<string, unknown>) => void }) {
  return <form className={`${styles.panel} ${styles.tierForm}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ name: formValue(form,"name"), description: formValue(form,"description"), requiredReferrals: Number(formValue(form,"requiredReferrals")), rewardType: formValue(form,"rewardType"), rewardValue: Number(formValue(form,"rewardValue")), rewardDurationDays: formValue(form,"rewardDurationDays") ? Number(formValue(form,"rewardDurationDays")) : null, couponValidityDays: formValue(form,"couponValidityDays") ? Number(formValue(form,"couponValidityDays")) : null, courseSlug: formValue(form,"courseSlug"), enabled: form.get("enabled") === "on", sortOrder: Number(formValue(form,"sortOrder")) }); }}>
    <header><div><span>{tier ? `${tier.requiredReferrals} إحالات` : "مستوى جديد"}</span><h2>{tier?.name || "أضف محطة مكافأة"}</h2></div>{tier ? <label className={styles.switch}><input name="enabled" type="checkbox" defaultChecked={tier.enabled} /><i /></label> : <input name="enabled" type="hidden" value="on" />}</header>
    <div className={styles.two}><label>اسم المستوى<input name="name" defaultValue={tier?.name || ""} required /></label><label>عدد الإحالات المطلوبة<input name="requiredReferrals" type="number" min="1" defaultValue={tier?.requiredReferrals || 5} /></label></div>
    <label>الوصف<input name="description" defaultValue={tier?.description || ""} /></label>
    <div className={styles.two}><label>نوع المكافأة<select name="rewardType" defaultValue={tier?.rewardType || "coupon_percent"}>{rewardTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>القيمة / الأشهر<input name="rewardValue" type="number" min="1" step="1" defaultValue={tier?.rewardValue || 25} /></label></div>
    <div className={styles.three}><label>صلاحية الكوبون<input name="couponValidityDays" type="number" min="1" max="730" defaultValue={tier?.couponValidityDays || 90} /></label><label>مدة المكافأة<input name="rewardDurationDays" type="number" min="1" max="730" defaultValue={tier?.rewardDurationDays || ""} /></label><label>الترتيب<input name="sortOrder" type="number" min="0" defaultValue={tier?.sortOrder || 10} /></label></div>
    <label>مادة محددة (اختياري)<input name="courseSlug" dir="ltr" defaultValue={tier?.courseSlug || ""} /></label>
    <button className={styles.primary} disabled={busy}>{busy ? <LoaderCircle className={styles.spin} /> : <Save />} {tier ? "حفظ المستوى" : "إنشاء المستوى"}</button>
  </form>;
}
