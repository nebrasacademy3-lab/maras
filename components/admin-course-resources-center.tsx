"use client";
import { SearchableSelect } from "@/components/searchable-select";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Archive, Building2, Check, ChevronLeft, Eye, EyeOff, FileCheck2, FileStack,
  FileText, GraduationCap, LoaderCircle, Pencil, RefreshCw, Search, ShieldAlert,
  ShieldCheck, Trash2, Upload, X,
} from "lucide-react";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { ADMIN_STEP_UP_MESSAGE, AdminMfaNotice, isAdminStepUpMessage, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import styles from "./admin-course-resources-center.module.css";

type AudienceScope = "specialty" | "institution";
type CatalogCourse = {
  slug: string;
  title: string;
  code: string;
  institutionSlug: string;
  institution: string;
  specialtySlug: string;
  specialty: string;
  audienceScope: AudienceScope;
  status: string;
};

type Resource = {
  id: number;
  courseSlug: string;
  title: string;
  description: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  studentVisible: boolean;
  status: "active" | "archived";
  sortOrder: number;
  scanStatus: "clean" | "pending" | "quarantined";
  scanProvider: string | null;
  scannedAt: string | null;
  scanError: string | null;
  quarantineReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type Notice = { tone: "ok" | "error" | "info"; text: string };
type EditState = { title: string; description: string; sortOrder: string; status: Resource["status"]; studentVisible: boolean };

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const acceptedFiles = ".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv";
const scanLabels: Record<Resource["scanStatus"], string> = { clean: "اجتاز الفحص", pending: "بانتظار الفحص", quarantined: "محجور" };
const statusLabels: Record<Resource["status"], string> = { active: "نشط", archived: "مؤرشف" };

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes.toLocaleString("ar-SA")} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("ar-SA", { maximumFractionDigits: 1 })} كيلوبايت`;
  return `${(bytes / 1024 / 1024).toLocaleString("ar-SA", { maximumFractionDigits: 1 })} ميجابايت`;
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}

function fileTypeLabel(contentType: string) {
  if (contentType === "application/pdf") return "PDF";
  if (contentType.includes("wordprocessingml")) return "Word";
  if (contentType.includes("presentationml")) return "PowerPoint";
  if (contentType.includes("spreadsheetml")) return "Excel";
  if (contentType === "text/csv") return "CSV";
  if (contentType === "text/plain") return "نص";
  if (contentType.startsWith("image/")) return "صورة";
  return "ملف";
}

export function AdminCourseResourcesCenter({ adminName }: { adminName: string }) {
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [query, setQuery] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingResources, setLoadingResources] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadCatalog = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/admin/course-resources", { cache: "no-store", credentials: "same-origin", signal });
      const payload = await response.json() as { courses?: CatalogCourse[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "تعذر تحميل المواد");
      const next = payload.courses || [];
      setCourses(next);
      setSelectedSlug((current) => current && next.some((course) => course.slug === current) ? current : next[0]?.slug || "");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر تحميل المواد" });
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const loadResources = useCallback(async (courseSlug: string, signal?: AbortSignal) => {
    if (!courseSlug) { setResources([]); return; }
    setLoadingResources(true);
    try {
      const response = await fetch(`/api/admin/course-resources?course=${encodeURIComponent(courseSlug)}`, { cache: "no-store", credentials: "same-origin", signal });
      const payload = await response.json() as { resources?: Resource[]; courses?: CatalogCourse[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "تعذر تحميل ملفات المادة");
      setResources(payload.resources || []);
      if (payload.courses) setCourses(payload.courses);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر تحميل ملفات المادة" });
    } finally {
      setLoadingResources(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadCatalog(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadCatalog]);

  useEffect(() => {
    if (!selectedSlug) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadResources(selectedSlug, controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadResources, selectedSlug]);

  const visibleCourses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return courses.filter((course) => !normalized || `${course.title} ${course.code} ${course.institution} ${course.specialty} ${course.slug}`.toLowerCase().includes(normalized));
  }, [courses, query]);
  const selectedCourse = courses.find((course) => course.slug === selectedSlug) || null;
  const stats = useMemo(() => ({
    total: resources.length,
    visible: resources.filter((resource) => resource.studentVisible && resource.status === "active" && resource.scanStatus === "clean").length,
    pending: resources.filter((resource) => resource.scanStatus === "pending").length,
  }), [resources]);

  async function updateScope(audienceScope: AudienceScope) {
    if (!selectedCourse || selectedCourse.audienceScope === audienceScope) return;
    setSaving(true); setNotice(null);
    try {
      const response = await fetch("/api/admin/course-resources", {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "scope", courseSlug: selectedCourse.slug, audienceScope }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "تعذر تغيير نطاق المادة");
      setCourses((current) => current.map((course) => course.slug === selectedCourse.slug ? { ...course, audienceScope } : course));
      setNotice({ tone: "ok", text: audienceScope === "institution" ? "ستظهر المادة الآن في جميع تخصصات الجامعة المحددة." : "أصبح ظهور المادة محصورًا في التخصص المحدد." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر تغيير نطاق المادة" });
    } finally { setSaving(false); }
  }

  async function uploadResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourse) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) { setNotice({ tone: "error", text: "اختر ملفًا للرفع." }); return; }
    if (file.size > MAX_FILE_BYTES) { setNotice({ tone: "error", text: "الحد الأقصى للملف الواحد 25 ميجابايت." }); return; }
    setSaving(true); setNotice(null);
    try {
      const response = await fetch(`/api/admin/course-resources?course=${encodeURIComponent(selectedCourse.slug)}`, { method: "POST", credentials: "same-origin", body: data });
      const payload = await response.json() as { error?: string; visibilityDeferred?: boolean };
      if (!response.ok) throw new Error(payload.error || "تعذر رفع الملف");
      form.reset();
      if (fileInput.current) fileInput.current.value = "";
      setNotice({ tone: payload.visibilityDeferred ? "info" : "ok", text: payload.visibilityDeferred ? "تم رفع الملف وحفظه مخفيًا حتى يجتاز الفحص الأمني." : "تم رفع الملف وحفظ إعدادات ظهوره." });
      await loadResources(selectedCourse.slug);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر رفع الملف" });
    } finally { setSaving(false); }
  }

  function beginEdit(resource: Resource) {
    setEditingId(resource.id);
    setEditState({ title: resource.title, description: resource.description, sortOrder: String(resource.sortOrder), status: resource.status, studentVisible: resource.studentVisible });
    setNotice(null);
  }

  async function patchResource(resource: Resource, values: Partial<EditState>, success: string) {
    const next = {
      title: values.title ?? resource.title,
      description: values.description ?? resource.description,
      sortOrder: Number(values.sortOrder ?? resource.sortOrder),
      status: values.status ?? resource.status,
      studentVisible: values.studentVisible ?? resource.studentVisible,
    };
    setBusyId(resource.id); setNotice(null);
    try {
      const response = await fetch("/api/admin/course-resources", {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update", id: resource.id, ...next }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "تعذر تحديث الملف");
      setNotice({ tone: "ok", text: success });
      setEditingId(null); setEditState(null);
      await loadResources(resource.courseSlug);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر تحديث الملف" });
    } finally { setBusyId(null); }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, resource: Resource) {
    event.preventDefault();
    if (!editState) return;
    await patchResource(resource, editState, "تم تحديث بيانات الملف وحفظ سجل التعديل.");
  }

  async function rescan(resource: Resource) {
    setBusyId(resource.id); setNotice(null);
    try {
      const response = await fetch("/api/admin/course-resources", {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "rescan", id: resource.id }),
      });
      const payload = await response.json() as { resource?: Resource; error?: string };
      if (!response.ok) throw new Error(payload.error || "تعذر إعادة الفحص");
      const result = payload.resource?.scanStatus;
      setNotice({ tone: result === "clean" ? "ok" : result === "quarantined" ? "error" : "info", text: result === "clean" ? "اجتاز الملف الفحص الأمني ويمكن إظهاره للطلاب." : result === "quarantined" ? "حُجر الملف وأُرشف تلقائيًا." : "ما زال الفحص معلقًا؛ تحقق من إعداد خدمة الفحص." });
      await loadResources(resource.courseSlug);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر إعادة الفحص" });
    } finally { setBusyId(null); }
  }

  async function remove(resource: Resource) {
    if (!window.confirm(`حذف «${resource.title}» نهائيًا من السجل والتخزين؟`)) return;
    setBusyId(resource.id); setNotice(null);
    try {
      const response = await fetch(`/api/admin/course-resources?id=${resource.id}`, { method: "DELETE", credentials: "same-origin" });
      const payload = await response.json() as { error?: string };
      if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
      if (!response.ok) throw new Error(payload.error || "تعذر حذف الملف");
      setNotice({ tone: "ok", text: "تم حذف الملف من المادة والتخزين." });
      if (editingId === resource.id) { setEditingId(null); setEditState(null); }
      await loadResources(resource.courseSlug);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر حذف الملف" });
    } finally { setBusyId(null); }
  }

  return <main className={styles.page} dir="rtl"><div className={styles.shell}>
    <AdminCenterNav />
    <header className={styles.header}>
      <div><span><FileStack size={16} /> مكتبة المحتوى المساند</span><h1>ملفات المواد ونطاق الظهور</h1><p>{adminName} · ارفع مراجع المادة، افحصها، وحدد بدقة من يراها عبر الويب والتطبيق.</p></div>
      <nav><button type="button" disabled={loadingCatalog || loadingResources} onClick={() => { void loadCatalog(); if (selectedSlug) void loadResources(selectedSlug); }}><RefreshCw size={15} /> تحديث</button><Link href="/admin">لوحة الإدارة</Link></nav>
    </header>

    {notice && notice.tone === "error" && isAdminStepUpMessage(notice.text) ? <AdminMfaNotice /> : notice ? <div className={styles.notice} data-tone={notice.tone}>{notice.tone === "ok" ? <Check size={17} /> : notice.tone === "info" ? <ShieldAlert size={17} /> : <X size={17} />}<span>{notice.text}</span></div> : null}

    <section className={styles.workspace}>
      <aside className={styles.coursePanel}>
        <div><span>المواد</span><strong>{courses.length.toLocaleString("ar-SA")}</strong></div>
        <label className={styles.search}><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالمادة أو الجامعة" /></label>
        <div className={styles.courseList}>
          {loadingCatalog ? <div className={styles.loading}><LoaderCircle className={styles.spin} size={20} /> جارٍ تحميل المواد…</div> : visibleCourses.length ? visibleCourses.map((course) => <button type="button" key={course.slug} data-active={course.slug === selectedSlug} onClick={() => { setSelectedSlug(course.slug); setEditingId(null); setEditState(null); setNotice(null); }}><i><FileText size={17} /></i><span><b>{course.title}</b><small>{course.institution} · {course.specialty}</small></span><em>{course.audienceScope === "institution" ? <Building2 size={14} /> : <GraduationCap size={14} />}</em></button>) : <div className={styles.emptySmall}>لا توجد مواد مطابقة.</div>}
        </div>
      </aside>

      <div className={styles.content}>
        {!selectedCourse ? <div className={styles.empty}><FileStack size={28} /><h2>اختر مادة لإدارة ملفاتها</h2><p>ستظهر المواد المحفوظة في الكتالوج هنا.</p></div> : <>
          <section className={styles.courseHero}>
            <div><span>{selectedCourse.institution}</span><h2>{selectedCourse.title}</h2><p>{selectedCourse.code ? `${selectedCourse.code} · ` : ""}{selectedCourse.specialty}</p></div>
            <div className={styles.stats}><article><small>كل الملفات</small><strong>{stats.total.toLocaleString("ar-SA")}</strong></article><article><small>ظاهرة للطلاب</small><strong>{stats.visible.toLocaleString("ar-SA")}</strong></article><article><small>بانتظار الفحص</small><strong>{stats.pending.toLocaleString("ar-SA")}</strong></article></div>
          </section>

          <section className={styles.scopeCard}>
            <div><span><Building2 size={16} /> نطاق ظهور المادة</span><h3>من يرى هذه المادة داخل الجامعة؟</h3><p>هذا الخيار يضبط كتالوج المادة نفسه، بينما يبقى الوصول إلى ملفاتها مشروطًا باشتراك نشط.</p></div>
            <div className={styles.scopeOptions}>
              <button type="button" data-active={selectedCourse.audienceScope === "specialty"} disabled={saving} onClick={() => void updateScope("specialty")}><GraduationCap size={20} /><span><b>التخصص المحدد فقط</b><small>{selectedCourse.specialty}</small></span>{selectedCourse.audienceScope === "specialty" ? <Check size={17} /> : null}</button>
              <button type="button" data-active={selectedCourse.audienceScope === "institution"} disabled={saving} onClick={() => void updateScope("institution")}><Building2 size={20} /><span><b>جميع تخصصات الجامعة</b><small>{selectedCourse.institution}</small></span>{selectedCourse.audienceScope === "institution" ? <Check size={17} /> : null}</button>
            </div>
          </section>

          <form className={styles.uploadCard} onSubmit={(event) => void uploadResource(event)}>
            <div className={styles.sectionHeading}><div><span><Upload size={16} /> ملف جديد</span><h3>أضف مادة مساندة للطلاب</h3><p>PDF وWord وPowerPoint وExcel والصور والنصوص فقط، بحد أقصى 25 ميجابايت.</p></div><ShieldCheck size={27} /></div>
            <div className={styles.formGrid}>
              <label>العنوان الظاهر للطالب<input name="title" maxLength={160} placeholder="مثال: ملخص الوحدة الأولى" /></label>
              <label>الترتيب<input name="sortOrder" type="number" min="0" max="10000" defaultValue="0" /></label>
              <label className={styles.wide}>وصف مختصر<textarea name="description" maxLength={1000} placeholder="اشرح محتوى الملف وكيف يستفيد منه الطالب." /></label>
              <label className={`${styles.filePicker} ${styles.wide}`}><Upload size={20} /><span><b>اختر الملف من جهازك</b><small>لن يظهر للطلاب قبل اجتياز الفحص الأمني.</small></span><input ref={fileInput} name="file" type="file" required accept={acceptedFiles} /></label>
              <label className={styles.switch}><input name="studentVisible" type="checkbox" value="true" /><span><Eye size={17} /> إظهاره للطلاب بعد نجاح الفحص</span></label>
            </div>
            <button className={styles.primary} disabled={saving} type="submit">{saving ? <LoaderCircle className={styles.spin} size={17} /> : <Upload size={17} />} رفع الملف</button>
          </form>

          {editingId && editState ? (() => {
            const resource = resources.find((item) => item.id === editingId);
            if (!resource) return null;
            return <form className={styles.editCard} onSubmit={(event) => void saveEdit(event, resource)}>
              <div className={styles.sectionHeading}><div><span><Pencil size={16} /> تعديل الملف</span><h3>{resource.title}</h3></div><button type="button" onClick={() => { setEditingId(null); setEditState(null); }}><X size={16} /> إلغاء</button></div>
              <div className={styles.formGrid}>
                <label>العنوان<input required minLength={2} maxLength={160} value={editState.title} onChange={(event) => setEditState({ ...editState, title: event.target.value })} /></label>
                <label>الترتيب<input type="number" min="0" max="10000" value={editState.sortOrder} onChange={(event) => setEditState({ ...editState, sortOrder: event.target.value })} /></label>
                <label className={styles.wide}>الوصف<textarea maxLength={1000} value={editState.description} onChange={(event) => setEditState({ ...editState, description: event.target.value })} /></label>
                <label>الحالة<SearchableSelect value={editState.status} onChange={(event) => setEditState({ ...editState, status: event.target.value as Resource["status"], studentVisible: event.target.value === "archived" ? false : editState.studentVisible })}><option value="active">نشط</option><option value="archived">مؤرشف</option></SearchableSelect></label>
                <label className={styles.switch}><input type="checkbox" checked={editState.studentVisible} disabled={resource.scanStatus !== "clean" || editState.status !== "active"} onChange={(event) => setEditState({ ...editState, studentVisible: event.target.checked })} /><span>{editState.studentVisible ? <Eye size={17} /> : <EyeOff size={17} />} ظاهر للطلاب</span></label>
              </div>
              <button className={styles.primary} disabled={busyId === resource.id} type="submit">{busyId === resource.id ? <LoaderCircle className={styles.spin} size={17} /> : <Check size={17} />} حفظ التعديلات</button>
            </form>;
          })() : null}

          <section className={styles.resourceSection}>
            <div className={styles.sectionHeading}><div><span><FileCheck2 size={16} /> مكتبة المادة</span><h3>الملفات المرفوعة</h3><p>لا يصل الطالب إلا إلى الملف النشط والظاهر الذي اجتاز الفحص.</p></div></div>
            {loadingResources ? <div className={styles.empty}><LoaderCircle className={styles.spin} size={23} /> جارٍ تحميل الملفات…</div> : resources.length ? <div className={styles.resourceGrid}>{resources.map((resource) => <article key={resource.id} className={styles.resourceCard} data-disabled={resource.status === "archived"}>
              <header><i><FileText size={21} /></i><div><span data-scan={resource.scanStatus}>{scanLabels[resource.scanStatus]}</span><span data-status={resource.status}>{statusLabels[resource.status]}</span>{resource.studentVisible ? <span data-visible="true"><Eye size={12} /> ظاهر</span> : <span><EyeOff size={12} /> مخفي</span>}</div></header>
              <h4>{resource.title}</h4><p>{resource.description || "لا يوجد وصف لهذا الملف."}</p>
              <dl><div><dt>الملف</dt><dd dir="ltr">{resource.originalName}</dd></div><div><dt>النوع والحجم</dt><dd>{fileTypeLabel(resource.contentType)} · {fileSize(resource.sizeBytes)}</dd></div><div><dt>الفحص</dt><dd>{dateLabel(resource.scannedAt)}</dd></div><div><dt>الترتيب</dt><dd>{resource.sortOrder.toLocaleString("ar-SA")}</dd></div></dl>
              {resource.scanError ? <small className={styles.warning}>تعذر إكمال الفحص: {resource.scanError}</small> : resource.quarantineReason ? <small className={styles.warning}>سبب الحجر: {resource.quarantineReason}</small> : null}
              <footer>
                <button type="button" onClick={() => beginEdit(resource)}><Pencil size={15} /> تعديل</button>
                <button type="button" disabled={busyId === resource.id || resource.scanStatus !== "clean" || resource.status !== "active"} onClick={() => void patchResource(resource, { studentVisible: !resource.studentVisible }, resource.studentVisible ? "تم إخفاء الملف عن الطلاب." : "أصبح الملف ظاهرًا للطلاب المشتركين.")}>{resource.studentVisible ? <EyeOff size={15} /> : <Eye size={15} />}{resource.studentVisible ? "إخفاء" : "إظهار"}</button>
                <button type="button" disabled={busyId === resource.id} onClick={() => void rescan(resource)}><RefreshCw className={busyId === resource.id ? styles.spin : ""} size={15} /> إعادة الفحص</button>
                <button type="button" disabled={busyId === resource.id} onClick={() => void patchResource(resource, { status: resource.status === "active" ? "archived" : "active", studentVisible: false }, resource.status === "active" ? "تمت أرشفة الملف وإخفاؤه." : "تمت إعادة تنشيط الملف؛ يبقى مخفيًا حتى تختار إظهاره.")}><Archive size={15} />{resource.status === "active" ? "أرشفة" : "تنشيط"}</button>
                <button type="button" className={styles.delete} disabled={busyId === resource.id} onClick={() => void remove(resource)}><Trash2 size={15} /> حذف</button>
              </footer>
            </article>)}</div> : <div className={styles.empty}><FileStack size={27} /><h3>لا توجد ملفات لهذه المادة</h3><p>ارفع أول ملف من النموذج أعلاه، ثم راقب نتيجة الفحص وحدد ظهوره.</p></div>}
          </section>
        </>}
      </div>
    </section>
    <Link className={styles.back} href="/admin"><ChevronLeft size={16} /> العودة إلى لوحة الإدارة</Link>
  </div></main>;
}
