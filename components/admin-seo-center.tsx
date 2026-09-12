"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { AdminMfaNotice } from "@/components/admin-mfa-notice";
import styles from "./admin-seo-center.module.css";

type PageRow = { path: string; kind: string; title: string; description: string; defaultTitle: string; defaultDescription: string; canonical: string; duplicateTitle: boolean; eligible: boolean; override: { title: string; description: string }; version: string | null };
type Report = { pages: PageRow[]; total: number; publicTotal: number; page: number; pageSize: number; health: { origin: string; indexingEnabled: boolean; googleVerifiedMetaConfigured: boolean; bingVerifiedMetaConfigured: boolean; indexNowEnabled: boolean; indexNowQueued: number; searchBots: string[] } };
export function AdminSeoCenter({ adminName }: { adminName: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PageRow | null>(null);
  const [title, setTitle] = useState(""), [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [stepUp, setStepUp] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/seo?q=${encodeURIComponent(query)}&page=${page}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تحميل التقرير");
      if (!signal?.aborted) { setReport(data); setError(""); }
    } catch (issue) {
      if (!signal?.aborted) setError(issue instanceof Error ? issue.message : "تعذر تحميل التقرير");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [query, page]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void load(controller.signal), 250); return () => { controller.abort(); clearTimeout(timer); }; }, [load]);
  const edit = (row: PageRow) => { setSelected(row); setTitle(row.override.title); setDescription(row.override.description); setMessage(""); setError(""); };
  const save = async () => {
    if (!selected) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/seo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", path: selected.path, title, description, version: selected.version }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر الحفظ");
      setMessage(data.queued ? "حُفظت البيانات وأضيفت الصفحة لطابور إشعار محركات البحث." : "حُفظت البيانات. تظهر في الصفحة العامة عند الطلب التالي.");
      setSelected(null); await load();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "تعذر الحفظ"); } finally { setBusy(false); }
  };
  const dispatch = async () => {
    setBusy(true); setStepUp(false); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/seo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dispatch" }) });
      const data = await response.json();
      if (response.status === 428) { setStepUp(true); return; }
      if (!response.ok) throw new Error(data.error || "تعذر الإرسال");
      setMessage(data.status === "submitted" ? `أُرسلت ${data.sent} صفحة إلى IndexNow. قبول الإشعار لا يعني ضمان الفهرسة.` : data.status === "retry" ? "تعذر قبول الإرسال؛ بقيت الصفحات في الطابور لإعادة المحاولة." : data.status === "disabled" ? "IndexNow غير مفعّل في هذه البيئة." : data.status === "busy" ? "توجد دفعة قيد الإرسال الآن." : "لا توجد صفحات مستحقة للإرسال الآن.");
      await load();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "تعذر الإرسال"); } finally { setBusy(false); }
  };
  return <main className={styles.root}>
    <header className={styles.header}><div><Link href="/admin">إدارة مراس</Link><h1>الظهور في البحث والذكاء الاصطناعي</h1><p>{adminName}، راجع أهلية الصفحات وعناوينها وأوصافها من مكان واحد.</p></div><button className="button button-ghost" onClick={() => void load()} disabled={loading || busy}>تحديث التقرير</button></header>
    <AdminCenterNav />
    {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.message} role="status">{message}</p>}{stepUp && <AdminMfaNotice />}
    {report && <><section className={styles.stats} aria-label="حالة التهيئة">
      <article><span>صفحات عامة معروفة</span><strong>{report.publicTotal.toLocaleString("ar-SA")}</strong></article>
      <article><span>الفهرسة في هذه البيئة</span><strong>{report.health.indexingEnabled ? "مسموح بها" : "موقوفة"}</strong></article>
      <article><span>إشعارات IndexNow المنتظرة</span><strong>{report.health.indexNowQueued.toLocaleString("ar-SA")}</strong><small>{report.health.indexNowEnabled ? "الإرسال مهيأ" : "الإرسال غير مفعّل"}</small></article>
    </section><section className={styles.card}><h2>جاهزية الاكتشاف</h2><p>النطاق العام: <bdi>{report.health.origin}</bdi></p><p>وسم تحقق Google: {report.health.googleVerifiedMetaConfigured ? "موجود" : "غير مضبوط؛ قد يكون التحقق عبر DNS"} · وسم تحقق Bing: {report.health.bingVerifiedMetaConfigured ? "موجود" : "غير مضبوط؛ قد يكون التحقق بطريقة أخرى"}</p><p>{report.health.indexingEnabled ? `تسمح السياسة العامة لزواحف البحث ${report.health.searchBots.join("، ")} بقراءة الصفحات العامة. يجب التحقق من وصولها أيضًا في إعدادات الاستضافة والحماية.` : "الزحف والفهرسة موقوفان في هذه البيئة؛ لا تُرسل صفحاتها إلى محركات البحث."}</p><p>هذه مراجعة لإعدادات المنصة، وليست إثباتًا للفهرسة أو التوصية. تبقى بيانات الطلاب ومساحات الحسابات محمية وغير مفهرسة.</p><div className={styles.actions}><a href="/sitemap.xml" target="_blank" rel="noreferrer">خريطة الموقع</a><a href="/robots.txt" target="_blank" rel="noreferrer">سياسة الزحف</a><a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Google Search Console</a><a href="https://www.bing.com/webmasters" target="_blank" rel="noreferrer">Bing Webmaster Tools</a><button className="button button-ghost" disabled={busy || !report.health.indexNowEnabled || !report.health.indexNowQueued} onClick={() => void dispatch()}>إرسال دفعة الإشعارات المنتظرة</button></div></section></>}
    <section className={styles.card}><h2>الصفحات والعناوين</h2><label className={styles.search}>ابحث باسم الصفحة أو رابطها<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} maxLength={120} placeholder="مادة، جامعة، أدوات..." /></label>{loading && <p role="status">جارٍ تحميل الصفحات…</p>}
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الصفحة</th><th>الوصف</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{report?.pages.map((row) => <tr key={row.path}><td><strong>{row.title}</strong><small><bdi>{row.path}</bdi> · {row.kind}</small></td><td>{row.description}</td><td>{row.eligible ? "مؤهلة حسب إعدادات المنصة" : "الفهرسة موقوفة"}{row.duplicateTitle && <small className={styles.warning}>عنوان مكرر بين صفحات عامة</small>}</td><td><button className="button button-ghost" onClick={() => edit(row)} disabled={busy}>معاينة وتحرير</button></td></tr>)}</tbody></table></div>
      {report && !report.total && <p>لا توجد صفحات مطابقة.</p>}{report && <div className={styles.pagination}><button className="button button-ghost" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>السابق</button><span>صفحة {page} من {Math.max(1, Math.ceil(report.total / report.pageSize))}</span><button className="button button-ghost" disabled={page * report.pageSize >= report.total || loading} onClick={() => setPage(page + 1)}>التالي</button></div>}
    </section>
    {selected && <section className={styles.card} aria-labelledby="seo-edit-title"><h2 id="seo-edit-title">تحرير بيانات الصفحة</h2><p><bdi>{selected.path}</bdi></p><form onSubmit={(event) => { event.preventDefault(); void save(); }}><label className={styles.field}>العنوان المخصص<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder={selected.defaultTitle} /><small>{Array.from(title).length} / 100 حرف</small></label><label className={styles.field}>الوصف المخصص<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={180} rows={4} placeholder={selected.defaultDescription} /><small>{Array.from(description).length} / 180 حرف</small></label><p>اترك الحقل فارغًا لاستخدام النص الأصلي. العنوان والوصف نصوص عادية؛ الرابط الأساسي وإمكانية الفهرسة تحددهما المنصة.</p><div className={styles.preview}><small><bdi>{selected.canonical}</bdi></small><h3>{title.trim() || selected.defaultTitle} | مراس العلم</h3><p>{description.trim() || selected.defaultDescription}</p></div><p className={styles.note}>المعاينة تقريبية؛ قد تختار محركات البحث عنوانًا أو مقتطفًا مختلفًا.</p><div className={styles.actions}><button className="button button-primary" type="submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</button><button className="button button-ghost" type="button" disabled={busy} onClick={() => { setTitle(""); setDescription(""); }}>استعادة النص الأصلي في النموذج</button><button className="button button-ghost" type="button" disabled={busy} onClick={() => setSelected(null)}>إغلاق</button></div></form></section>}
    <section className={styles.card}><h2>متابعة الظهور في الإجابات الذكية</h2><p>تحقق من السماح بالمشاركة في ميزات البحث التوليدي داخل Search Console، ثم تابع تقرير الانطباعات. يعرض Bing تقريرًا للاقتباسات والصفحات المشار إليها. لا تمنح هذه المنصة وعدًا بترتيب أو توصية من أي مساعد.</p><p><a href="https://developers.google.com/search/docs/fundamentals/ai-optimization-guide" target="_blank" rel="noreferrer">دليل Google الرسمي</a> · <a href="https://platform.openai.com/docs/bots" target="_blank" rel="noreferrer">زواحف البحث لدى OpenAI</a> · <a href="https://docs.perplexity.ai/docs/resources/perplexity-crawlers" target="_blank" rel="noreferrer">إرشادات Perplexity</a></p></section>
  </main>;
}
