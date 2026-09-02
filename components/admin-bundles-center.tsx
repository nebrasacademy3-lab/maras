"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Archive, BadgePercent, Boxes, CalendarDays, Check, ChevronLeft, CircleDollarSign,
  CopyPlus, Edit3, PackageCheck, RefreshCw, Search, Sparkles, Trash2, X,
} from "lucide-react";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { fromDateTimeLocal, toDateTimeLocal } from "@/components/admin-datetime";
import { ADMIN_STEP_UP_MESSAGE, AdminMfaNotice, isAdminStepUpMessage, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import { useRealtimeSync } from "@/components/realtime-sync";
import styles from "./admin-bundles-center.module.css";

type CatalogCourse = {
  slug: string;
  title: string;
  university: string;
  universitySlug: string;
  specialty: string;
  specialtySlug: string;
  price: number;
  availableForPurchase: boolean;
};

type BundleStatus = "draft" | "published" | "archived";
type Bundle = {
  id: number;
  slug: string;
  title: string;
  description: string;
  institutionSlug: string | null;
  specialtySlug: string | null;
  discountType: "percent" | "fixed";
  discountValue: number;
  status: BundleStatus;
  featured: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  courseSlugs: string[];
  courses: Array<{ slug:string; title:string; price:number; status:string }>;
  updatedAt: string;
};

type FormState = {
  slug: string;
  title: string;
  description: string;
  institutionSlug: string;
  specialtySlug: string;
  discountType: "percent" | "fixed";
  discountValue: string;
  status: BundleStatus;
  featured: boolean;
  startsAt: string;
  expiresAt: string;
  courseSlugs: string[];
};

const emptyForm: FormState = {
  slug: "",
  title: "",
  description: "",
  institutionSlug: "",
  specialtySlug: "",
  discountType: "percent",
  discountValue: "10",
  status: "draft",
  featured: false,
  startsAt: "",
  expiresAt: "",
  courseSlugs: [],
};

const statusLabel: Record<BundleStatus,string> = { draft:"مسودة", published:"منشورة", archived:"مؤرشفة" };
const money = (value:number) => new Intl.NumberFormat("ar-SA", { style:"currency", currency:"SAR", maximumFractionDigits:2 }).format(value || 0);
const localDate = (value:string|null) => value ? new Date(value).toLocaleString("ar-SA", { dateStyle:"medium", timeStyle:"short" }) : "—";
const dateInput = (value:string|null) => toDateTimeLocal(value);

export function AdminBundlesCenter({ adminName }:{ adminName:string }) {
  const [bundles,setBundles] = useState<Bundle[]>([]);
  const [catalog,setCatalog] = useState<CatalogCourse[]>([]);
  const [form,setForm] = useState<FormState>(emptyForm);
  const [editingId,setEditingId] = useState<number|null>(null);
  const [query,setQuery] = useState("");
  const [courseQuery,setCourseQuery] = useState("");
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [notice,setNotice] = useState<{tone:"ok"|"error";text:string}|null>(null);

  const lastLoad = useRef(0);
  const load = useCallback(async (signal?:AbortSignal) => {
    lastLoad.current = Date.now();
    try {
      const response = await fetch("/api/admin/bundles", { cache:"no-store", credentials:"same-origin", signal });
      const payload = await response.json() as { bundles?:Bundle[]; catalog?:CatalogCourse[]; error?:string };
      if (!response.ok) throw new Error(payload.error || "تعذر تحميل الباقات");
      setBundles(payload.bundles || []);
      setCatalog(payload.catalog || []);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice({ tone:"error", text:error instanceof Error ? error.message : "تعذر تحميل الباقات" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);
  useRealtimeSync((payload) => {
    if (payload.changed && !payload.changed.includes("admin") && !payload.changed.includes("catalog")) return;
    if (Date.now() - lastLoad.current < 5000) return;
    void load();
  });

  const universities = useMemo(() => {
    const map = new Map<string,string>();
    for (const course of catalog) map.set(course.universitySlug, course.university);
    return [...map.entries()].sort((a,b) => a[1].localeCompare(b[1], "ar"));
  }, [catalog]);

  const specialties = useMemo(() => {
    const map = new Map<string,string>();
    for (const course of catalog) {
      if (form.institutionSlug && course.universitySlug !== form.institutionSlug) continue;
      if (course.specialtySlug) map.set(course.specialtySlug, course.specialty);
    }
    return [...map.entries()].sort((a,b) => a[1].localeCompare(b[1], "ar"));
  }, [catalog, form.institutionSlug]);

  const filteredCourses = useMemo(() => {
    const normalized = courseQuery.trim().toLowerCase();
    return catalog.filter((course) => {
      if (form.institutionSlug && course.universitySlug !== form.institutionSlug) return false;
      if (form.specialtySlug && course.specialtySlug !== form.specialtySlug) return false;
      if (!normalized) return true;
      return `${course.title} ${course.university} ${course.specialty} ${course.slug}`.toLowerCase().includes(normalized);
    });
  }, [catalog, courseQuery, form.institutionSlug, form.specialtySlug]);

  const selectedCourses = useMemo(() => form.courseSlugs.map((slug) => catalog.find((course) => course.slug === slug)).filter((course):course is CatalogCourse => Boolean(course)), [catalog, form.courseSlugs]);
  const subtotal = selectedCourses.reduce((sum,course) => sum + course.price, 0);
  const discountNumber = Math.max(0, Number(form.discountValue) || 0);
  const discount = form.discountType === "percent" ? Math.min(subtotal * discountNumber / 100, subtotal) : Math.min(discountNumber, subtotal);
  const total = Math.max(0, subtotal - discount);
  const unavailableCount = selectedCourses.filter((course) => !course.availableForPurchase).length;

  const visibleBundles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return bundles.filter((bundle) => !normalized || `${bundle.title} ${bundle.slug} ${bundle.description}`.toLowerCase().includes(normalized));
  }, [bundles, query]);

  const toggleCourse = (slug:string) => setForm((current) => ({
    ...current,
    courseSlugs: current.courseSlugs.includes(slug) ? current.courseSlugs.filter((item) => item !== slug) : [...current.courseSlugs, slug],
  }));

  const reset = () => {
    setEditingId(null);
    setForm(emptyForm);
    setCourseQuery("");
    setNotice(null);
  };

  const edit = (bundle:Bundle) => {
    setEditingId(bundle.id);
    setForm({
      slug:bundle.slug,
      title:bundle.title,
      description:bundle.description,
      institutionSlug:bundle.institutionSlug || "",
      specialtySlug:bundle.specialtySlug || "",
      discountType:bundle.discountType,
      discountValue:String(bundle.discountValue),
      status:bundle.status,
      featured:bundle.featured,
      startsAt:dateInput(bundle.startsAt),
      expiresAt:dateInput(bundle.expiresAt),
      courseSlugs:bundle.courseSlugs,
    });
    setNotice(null);
    window.scrollTo({ top:0, behavior:"smooth" });
  };

  const duplicate = (bundle:Bundle) => {
    setEditingId(null);
    setForm({
      slug:`${bundle.slug}-new`, title:`نسخة من ${bundle.title}`, description:bundle.description,
      institutionSlug:bundle.institutionSlug || "", specialtySlug:bundle.specialtySlug || "",
      discountType:bundle.discountType, discountValue:String(bundle.discountValue), status:"draft",
      featured:false, startsAt:"", expiresAt:"", courseSlugs:bundle.courseSlugs,
    });
    window.scrollTo({ top:0, behavior:"smooth" });
  };

  const save = async () => {
    if (form.courseSlugs.length < 2) { setNotice({ tone:"error", text:"اختر مادتين على الأقل داخل الباقة." }); return; }
    if (form.status === "published" && unavailableCount) { setNotice({ tone:"error", text:"لا يمكن النشر قبل جاهزية جميع المواد المختارة." }); return; }
    setSaving(true); setNotice(null);
    try {
      const response = await fetch("/api/admin/bundles", {
        method:editingId ? "PATCH" : "POST",
        credentials:"same-origin",
        headers:{ "content-type":"application/json" },
        body:JSON.stringify({ ...form, id:editingId, discountValue:Number(form.discountValue), institutionSlug:form.institutionSlug || null, specialtySlug:form.specialtySlug || null, startsAt:fromDateTimeLocal(form.startsAt), expiresAt:fromDateTimeLocal(form.expiresAt) }),
      });
      const payload = await response.json() as { error?:string };
      if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
      if (!response.ok) throw new Error(payload.error || "تعذر حفظ الباقة");
      setNotice({ tone:"ok", text:editingId ? "تم تحديث الباقة وحفظ سجل التعديل." : "تم إنشاء الباقة بنجاح." });
      setEditingId(null); setForm(emptyForm); setCourseQuery("");
      await load();
    } catch (error) {
      setNotice({ tone:"error", text:error instanceof Error ? error.message : "تعذر حفظ الباقة" });
    } finally { setSaving(false); }
  };

  const archive = async (bundle:Bundle) => {
    setSaving(true); setNotice(null);
    try {
      const response = await fetch("/api/admin/bundles", { method:"PATCH", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify({ ...bundle, status:"archived", courseSlugs:bundle.courseSlugs }) });
      const payload = await response.json() as { error?:string };
      if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
      if (!response.ok) throw new Error(payload.error || "تعذر أرشفة الباقة");
      setNotice({ tone:"ok", text:"تم إيقاف ظهور الباقة وأرشفتها." }); await load();
    } catch (error) { setNotice({ tone:"error", text:error instanceof Error ? error.message : "تعذر أرشفة الباقة" }); }
    finally { setSaving(false); }
  };

  const remove = async (bundle:Bundle) => {
    if (!window.confirm(`حذف باقة «${bundle.title}» نهائيًا؟ إذا ارتبطت بطلب مالي سيمنع النظام الحذف.`)) return;
    setSaving(true); setNotice(null);
    try {
      const response = await fetch(`/api/admin/bundles?id=${bundle.id}`, { method:"DELETE", credentials:"same-origin" });
      const payload = await response.json() as { error?:string };
      if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
      if (!response.ok) throw new Error(payload.error || "تعذر حذف الباقة");
      setNotice({ tone:"ok", text:"تم حذف الباقة غير المستخدمة." }); await load();
    } catch (error) { setNotice({ tone:"error", text:error instanceof Error ? error.message : "تعذر حذف الباقة" }); }
    finally { setSaving(false); }
  };

  return <main className={styles.page} dir="rtl"><div className={styles.shell}>
    <AdminCenterNav />
    <header className={styles.header}>
      <div><span><Boxes size={16}/> الباقات والعروض المركبة</span><h1>مركز إدارة الباقات</h1><p>{adminName} · كوّن عروضًا واضحة من مواد جاهزة مع تسعير محكوم وسجل تدقيق.</p></div>
      <nav><Link href="/admin/finance">المركز المالي</Link><Link href="/admin/operations">التشغيل والتحليلات</Link></nav>
    </header>

    {notice && notice.tone === "error" && isAdminStepUpMessage(notice.text) ? <AdminMfaNotice /> : notice ? <div className={`${styles.notice} ${styles[notice.tone]}`}>{notice.tone === "ok" ? <Check size={17}/> : <X size={17}/>}<span>{notice.text}</span></div> : null}

    <section className={styles.editor}>
      <div className={styles.editorHeading}><div><span>{editingId ? "تعديل الباقة" : "باقة جديدة"}</span><h2>{editingId ? form.title || "تعديل البيانات" : "أنشئ عرضًا متكاملًا"}</h2></div>{editingId ? <button type="button" onClick={reset}><X size={16}/> إلغاء التعديل</button> : null}</div>
      <div className={styles.formGrid}>
        <label>اسم الباقة<input value={form.title} onChange={(event)=>setForm({...form,title:event.target.value})} placeholder="مثال: باقة المستوى الأول"/></label>
        <label>المعرّف الإنجليزي<input dir="ltr" value={form.slug} onChange={(event)=>setForm({...form,slug:event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "-")})} placeholder="level-one-bundle"/></label>
        <label className={styles.wide}>الوصف<textarea value={form.description} onChange={(event)=>setForm({...form,description:event.target.value})} placeholder="وضّح فائدة الباقة والمواد التي تجمعها."/></label>
        <label>الجامعة<select value={form.institutionSlug} onChange={(event)=>setForm({...form,institutionSlug:event.target.value,specialtySlug:""})}><option value="">كل الجامعات</option>{universities.map(([slug,name])=><option key={slug} value={slug}>{name}</option>)}</select></label>
        <label>التخصص<select value={form.specialtySlug} onChange={(event)=>setForm({...form,specialtySlug:event.target.value})}><option value="">كل التخصصات</option>{specialties.map(([slug,name])=><option key={slug} value={slug}>{name}</option>)}</select></label>
        <label>نوع الخصم<select value={form.discountType} onChange={(event)=>setForm({...form,discountType:event.target.value as FormState["discountType"]})}><option value="percent">نسبة مئوية</option><option value="fixed">مبلغ ثابت</option></select></label>
        <label>قيمة الخصم<input type="number" min="0.01" max={form.discountType === "percent" ? 95 : undefined} step="0.01" value={form.discountValue} onChange={(event)=>setForm({...form,discountValue:event.target.value})}/></label>
        <label>تبدأ في<input type="datetime-local" value={form.startsAt} onChange={(event)=>setForm({...form,startsAt:event.target.value})}/></label>
        <label>تنتهي في<input type="datetime-local" value={form.expiresAt} onChange={(event)=>setForm({...form,expiresAt:event.target.value})}/></label>
        <label>حالة الباقة<select value={form.status} onChange={(event)=>setForm({...form,status:event.target.value as BundleStatus})}><option value="draft">مسودة</option><option value="published">منشورة</option><option value="archived">مؤرشفة</option></select></label>
        <label className={styles.switch}><input type="checkbox" checked={form.featured} onChange={(event)=>setForm({...form,featured:event.target.checked})}/><span><Sparkles size={16}/> إبراز الباقة في الواجهة</span></label>
      </div>

      <div className={styles.coursePicker}>
        <div className={styles.pickerHeading}><div><h3>مواد الباقة</h3><p>اختر من مادتين إلى 30 مادة. المواد غير الجاهزة متاحة للمسودة فقط.</p></div><label><Search size={16}/><input value={courseQuery} onChange={(event)=>setCourseQuery(event.target.value)} placeholder="ابحث باسم المادة أو الجامعة"/></label></div>
        <div className={styles.courseGrid}>{filteredCourses.map((course) => { const selected=form.courseSlugs.includes(course.slug); return <button type="button" key={course.slug} className={selected ? styles.selectedCourse : ""} onClick={()=>toggleCourse(course.slug)}><i>{selected ? <Check size={15}/> : <CopyPlus size={15}/>}</i><span><b>{course.title}</b><small>{course.university} · {course.specialty}</small></span><em>{money(course.price)}{!course.availableForPurchase ? <small>قيد التجهيز</small> : null}</em></button>; })}</div>
      </div>

      <aside className={styles.quote}>
        <div><span><PackageCheck size={18}/> ملخص الباقة</span><strong>{form.courseSlugs.length} مواد</strong></div>
        <div><span>السعر قبل الخصم</span><b>{money(subtotal)}</b></div><div><span>الخصم</span><b className={styles.discount}>− {money(discount)}</b></div><div className={styles.total}><span>سعر الباقة</span><b>{money(total)}</b></div>
        {unavailableCount ? <p>{unavailableCount} من المواد قيد التجهيز؛ احفظ الباقة كمسودة حتى تجهز.</p> : <p className={styles.ready}>كل المواد المحددة جاهزة للنشر.</p>}
        <button type="button" disabled={saving} onClick={()=>void save()}>{saving ? <RefreshCw className={styles.spin} size={17}/> : <Check size={17}/>} {editingId ? "حفظ التعديلات" : "إنشاء الباقة"}</button>
      </aside>
    </section>

    <section className={styles.listSection}>
      <div className={styles.listHeading}><div><span>إدارة دورة الحياة</span><h2>الباقات الحالية</h2></div><label><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="ابحث في الباقات"/></label></div>
      {loading ? <div className={styles.empty}><RefreshCw className={styles.spin} size={22}/> جارٍ تحميل الباقات…</div> : visibleBundles.length ? <div className={styles.bundleGrid}>{visibleBundles.map((bundle) => {
        const bundleSubtotal=bundle.courses.reduce((sum,course)=>sum+course.price,0);
        const bundleDiscount=bundle.discountType === "percent" ? bundleSubtotal*bundle.discountValue/100 : bundle.discountValue;
        return <article key={bundle.id} className={styles.bundleCard}>
          <header><div className={styles.bundleIcon}><Boxes size={20}/></div><div><span className={`${styles.status} ${styles[bundle.status]}`}>{statusLabel[bundle.status]}</span>{bundle.featured ? <span className={styles.featured}><Sparkles size={12}/> مميزة</span> : null}</div></header>
          <h3>{bundle.title}</h3><p>{bundle.description || "لا يوجد وصف لهذه الباقة."}</p>
          <div className={styles.bundleMeta}><span><PackageCheck size={15}/>{bundle.courseSlugs.length} مواد</span><span><BadgePercent size={15}/>{bundle.discountType === "percent" ? `${bundle.discountValue}%` : money(bundle.discountValue)}</span><span><CircleDollarSign size={15}/>{money(Math.max(0,bundleSubtotal-bundleDiscount))}</span></div>
          <div className={styles.dates}><span><CalendarDays size={14}/> البداية: {localDate(bundle.startsAt)}</span><span><CalendarDays size={14}/> النهاية: {localDate(bundle.expiresAt)}</span></div>
          <footer><button type="button" onClick={()=>edit(bundle)}><Edit3 size={15}/> تعديل</button><button type="button" onClick={()=>duplicate(bundle)}><CopyPlus size={15}/> نسخ</button>{bundle.status !== "archived" ? <button type="button" onClick={()=>void archive(bundle)}><Archive size={15}/> أرشفة</button> : null}<button type="button" className={styles.delete} onClick={()=>void remove(bundle)}><Trash2 size={15}/> حذف</button></footer>
        </article>;
      })}</div> : <div className={styles.empty}><Boxes size={26}/><h3>لا توجد باقات بعد</h3><p>ابدأ باختيار المواد من النموذج أعلاه.</p></div>}
    </section>
    <Link className={styles.back} href="/admin"><ChevronLeft size={16}/> العودة إلى لوحة الإدارة</Link>
  </div></main>;
}
