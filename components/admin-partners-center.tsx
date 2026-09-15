"use client";
import { SearchableSelect } from "@/components/searchable-select";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Award, BadgeCheck, Building2, CheckCircle2, CreditCard, ExternalLink, EyeOff,
  FileCheck2, Handshake, ImagePlus, LoaderCircle, Pencil, Plus, RefreshCw,
  Save, Search, ShieldCheck, Trash2, X,
} from "lucide-react";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { ADMIN_STEP_UP_MESSAGE, AdminMfaNotice, isAdminStepUpMessage, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import styles from "./admin-partners-center.module.css";

type PartnerKind = "partner" | "accreditation" | "payment";
type PartnerStatus = "draft" | "published" | "hidden";
type Partner = {
  id: number; name: string; kind: PartnerKind; description: string; logo: string;
  destinationUrl: string | null; credentialNumber: string | null; verificationUrl: string | null;
  rightsConfirmed: boolean; rightsReference: string | null;
  status: PartnerStatus; sortOrder: number; createdAt: string; updatedAt: string;
};
type EditorState = {
  id: number | null; name: string; kind: PartnerKind; description: string; logo: string;
  logoUrl: string; destinationUrl: string; credentialNumber: string; verificationUrl: string;
  rightsConfirmed: boolean; rightsReference: string;
  status: PartnerStatus; sortOrder: number;
};

const EMPTY_EDITOR: EditorState = {
  id: null, name: "", kind: "partner", description: "", logo: "", logoUrl: "",
  destinationUrl: "", credentialNumber: "", verificationUrl: "", rightsConfirmed: true,
  rightsReference: "", status: "published", sortOrder: 10,
};
const KIND_LABELS: Record<PartnerKind, string> = {
  partner: "شريك للمنصة", accreditation: "اعتماد أو ترخيص", payment: "شريك دفع",
};
const STATUS_LABELS: Record<PartnerStatus, string> = {
  draft: "مسودة", published: "منشور", hidden: "مخفي",
};

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function isHttps(value: string) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function partnerIcon(kind: PartnerKind) {
  if (kind === "accreditation") return Award;
  if (kind === "payment") return CreditCard;
  return Handshake;
}

export function AdminPartnersCenter({ adminName }: { adminName: string }) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | PartnerKind>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PartnerStatus>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const editorRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/partners", { cache: "no-store", credentials: "same-origin" });
      const result = await response.json().catch(() => ({})) as { partners?: Partner[]; error?: string };
      if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
      if (!response.ok) throw new Error(result.error || "تعذر تحميل الشركاء والاعتمادات");
      setPartners(Array.isArray(result.partners) ? result.partners : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الشركاء والاعتمادات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const resetEditor = useCallback(() => {
    setEditor(EMPTY_EDITOR);
    setFile(null);
    setFileInputKey((value) => value + 1);
    setError("");
  }, []);

  const editPartner = (partner: Partner) => {
    setEditor({
      id: partner.id, name: partner.name, kind: partner.kind, description: partner.description || "",
      logo: partner.logo || "", logoUrl: partner.logo?.startsWith("https://") ? partner.logo : "",
      destinationUrl: partner.destinationUrl || "", credentialNumber: partner.credentialNumber || "",
      verificationUrl: partner.verificationUrl || "", rightsConfirmed: partner.kind === "accreditation" ? partner.rightsConfirmed : true,
      rightsReference: partner.rightsReference || "", status: partner.status, sortOrder: partner.sortOrder,
    });
    setFile(null);
    setFileInputKey((value) => value + 1);
    setMessage("");
    setError("");
    window.setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const chooseFile = (nextFile: File | null) => {
    if (!nextFile) { setFile(null); return; }
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(nextFile.type.toLowerCase())) {
      setError("الصيغ المسموحة للشعار: PNG أو JPG أو WebP فقط.");
      setFile(null);
      setFileInputKey((value) => value + 1);
      return;
    }
    if (nextFile.size > 2 * 1024 * 1024) {
      setError("حجم الشعار يجب ألا يتجاوز 2 ميجابايت.");
      setFile(null);
      setFileInputKey((value) => value + 1);
      return;
    }
    setError("");
    setFile(nextFile);
  };

  const savePartner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!file && !editor.logo && !editor.logoUrl.trim()) {
      setError("أرفق شعارًا أو أدخل رابط صورة آمنًا يبدأ بـ HTTPS.");
      return;
    }
    if (editor.status === "published" && editor.kind === "accreditation" && !editor.rightsConfirmed) {
      setError("لا يمكن النشر قبل تأكيد حق استخدام الشعار.");
      return;
    }
    if (editor.verificationUrl.trim() && !isHttps(editor.verificationUrl.trim())) {
      setError("رابط التحقق يجب أن يكون رابط HTTPS صالحًا.");
      return;
    }
    if (editor.status === "published" && editor.kind === "accreditation") {
      if (editor.credentialNumber.trim().length < 2) {
        setError("أدخل رقم الاعتماد أو الترخيص قبل النشر.");
        return;
      }
    }
    const body = new FormData();
    if (editor.id) body.set("id", String(editor.id));
    body.set("name", editor.name.trim());
    body.set("kind", editor.kind);
    body.set("description", editor.description.trim());
    body.set("logoUrl", editor.logoUrl.trim());
    body.set("destinationUrl", editor.destinationUrl.trim());
    body.set("credentialNumber", editor.credentialNumber.trim());
    body.set("verificationUrl", editor.verificationUrl.trim());
    body.set("rightsConfirmed", String(editor.rightsConfirmed));
    body.set("rightsReference", editor.rightsReference.trim());
    body.set("status", editor.status);
    body.set("sortOrder", String(editor.sortOrder));
    if (file) body.set("file", file);
    setSaving(true);
    try {
      const response = await fetch("/api/admin/partners", { method: "POST", credentials: "same-origin", body });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
      if (!response.ok) throw new Error(result.error || "تعذر حفظ السجل");
      setMessage(editor.id ? "تم تحديث السجل بنجاح." : "تمت إضافة السجل بنجاح.");
      resetEditor();
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ السجل");
    } finally {
      setSaving(false);
    }
  };

  const deletePartner = async (partner: Partner) => {
    if (!window.confirm("هل تريد حذف «" + partner.name + "» نهائيًا؟ سيُحذف الشعار المرفوع معه.")) return;
    setDeletingId(partner.id);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/partners", {
        method: "DELETE", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: partner.id }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
      if (!response.ok) throw new Error(result.error || "تعذر حذف السجل");
      if (editor.id === partner.id) resetEditor();
      setMessage("تم حذف السجل والشعار المرتبط به.");
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حذف السجل");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredPartners = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ar");
    return partners.filter((partner) => {
      if (kindFilter !== "all" && partner.kind !== kindFilter) return false;
      if (statusFilter !== "all" && partner.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [partner.name, partner.description, partner.credentialNumber || "", partner.rightsReference || ""]
        .some((value) => value.toLocaleLowerCase("ar").includes(normalizedQuery));
    });
  }, [kindFilter, partners, query, statusFilter]);

  const publishedCount = partners.filter((partner) => partner.status === "published").length;
  const accreditationCount = partners.filter((partner) => partner.kind === "accreditation").length;
  const confirmedCount = partners.filter((partner) => partner.rightsConfirmed).length;
  const displayedLogo = previewUrl || editor.logo || editor.logoUrl;

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.shell}>
        <AdminCenterNav />
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span><Handshake size={16} /> مركز الهوية المؤسسية</span>
            <h1>الشركاء والاعتمادات</h1>
            <p>أدر الشعارات والموافقات من مكان واحد، وحدد ما يظهر للزوار فقط بعد اكتمال حق الاستخدام.</p>
          </div>
          <div className={styles.heroActions}>
            <span className={styles.adminChip}><ShieldCheck size={16} /> {adminName}</span>
            <button type="button" onClick={() => void load(true)} disabled={loading}>
              <RefreshCw className={loading ? styles.spin : ""} size={16} /> تحديث
            </button>
          </div>
        </header>

        <section className={styles.stats} aria-label="ملخص الشركاء والاعتمادات">
          <article><span><Building2 /></span><div><small>إجمالي السجلات</small><strong>{partners.length.toLocaleString("ar-SA")}</strong></div></article>
          <article><span><CheckCircle2 /></span><div><small>منشورة حاليًا</small><strong>{publishedCount.toLocaleString("ar-SA")}</strong></div></article>
          <article><span><Award /></span><div><small>اعتمادات وتراخيص</small><strong>{accreditationCount.toLocaleString("ar-SA")}</strong></div></article>
          <article><span><FileCheck2 /></span><div><small>حقوق مؤكدة</small><strong>{confirmedCount.toLocaleString("ar-SA")}</strong></div></article>
        </section>

        {isAdminStepUpMessage(error) ? <AdminMfaNotice /> : null}
        {!isAdminStepUpMessage(error) && (message || error) ? (
          <div className={error ? styles.errorNotice : styles.successNotice} role="status" aria-live="polite">{error || message}</div>
        ) : null}

        <section className={styles.workspace}>
          <form ref={editorRef} className={styles.editor} onSubmit={savePartner}>
            <div className={styles.sectionHeading}>
              <div>
                <span>{editor.id ? "تحرير السجل" : "سجل جديد"}</span>
                <h2>{editor.id ? editor.name || "تعديل الشريك" : "أضف شريكًا أو اعتمادًا"}</h2>
              </div>
              {editor.id ? (
                <button type="button" className={styles.ghostButton} onClick={resetEditor}><X size={15} /> إلغاء التعديل</button>
              ) : <span className={styles.draftPill}><Plus size={14} /> يظهر بعد الحفظ</span>}
            </div>
            <div className={styles.safetyBox}>
              <ShieldCheck size={20} />
              <div><strong>النشر مرتبط بالموافقة والتحقق</strong><p>يتطلب نشر الاعتماد رقمًا صادرًا ومرجع حق الاستخدام ورابط تحقق رسميًا يبدأ بـ HTTPS. تبقى هذه الحقول اختيارية للشريك العادي.</p></div>
            </div>
            <div className={styles.formGrid}>
              <label>الاسم الظاهر
                <input value={editor.name} onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={140} placeholder="مثال: اسم الجهة الشريكة" />
              </label>
              <label>التصنيف
                <SearchableSelect value={editor.kind} onChange={(event) => { const kind = event.target.value as PartnerKind; setEditor((current) => ({ ...current, kind, rightsConfirmed: kind === "accreditation" ? false : true })); }}>
                  <option value="partner">شريك للمنصة</option><option value="accreditation">اعتماد أو ترخيص</option><option value="payment">شريك دفع</option>
                </SearchableSelect>
              </label>
              <label className={styles.wide}>وصف مختصر
                <textarea value={editor.description} onChange={(event) => setEditor((current) => ({ ...current, description: event.target.value }))} rows={3} maxLength={500} placeholder="ما طبيعة الشراكة أو الاعتماد؟" />
              </label>
              <div className={styles.logoField}>
                <span className={styles.fieldLabel}>الشعار</span>
                <label className={styles.uploadBox}>
                  <input key={fileInputKey} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
                  {displayedLogo ? (
                    <Image src={displayedLogo} alt="معاينة الشعار" width={180} height={100} unoptimized />
                  ) : (
                    <span className={styles.uploadPlaceholder}><ImagePlus size={28} /><b>اختر صورة الشعار</b><small>PNG أو JPG أو WebP · حتى 2 ميجابايت</small></span>
                  )}
                  <i>{file ? file.name : displayedLogo ? "اضغط لاستبدال الصورة" : "رفع صورة"}</i>
                </label>
              </div>
              <input type="hidden" value={editor.logoUrl} readOnly />
              <label className={styles.wide}>رابط موقع الشريك <small>(اختياري)</small>
                <input dir="ltr" type="url" value={editor.destinationUrl} onChange={(event) => setEditor((current) => ({ ...current, destinationUrl: event.target.value }))} placeholder="https://example.sa" />
              </label>
              {editor.kind === "accreditation" ? <>
                <label>رقم الاعتماد أو الترخيص
                  <input dir="ltr" value={editor.credentialNumber} onChange={(event) => setEditor((current) => ({ ...current, credentialNumber: event.target.value }))} maxLength={180} required={editor.status === "published"} placeholder="مثال: NELC-000000" />
                </label>
                <label>رابط التحقق الرسمي (اختياري)
                  <input dir="ltr" type="url" value={editor.verificationUrl} onChange={(event) => setEditor((current) => ({ ...current, verificationUrl: event.target.value }))} placeholder="https://..." />
                </label>
              </> : null}
              <label>حالة الظهور
                <SearchableSelect value={editor.status} onChange={(event) => setEditor((current) => ({ ...current, status: event.target.value as PartnerStatus }))}>
                  <option value="draft">مسودة — لا تظهر للزوار</option><option value="published">منشور — يظهر للزوار</option><option value="hidden">مخفي — محفوظ دون عرض</option>
                </SearchableSelect>
              </label>
              <label>أولوية الترتيب
                <input type="number" min={0} max={10000} value={editor.sortOrder} onChange={(event) => setEditor((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
                <small>الأصغر يظهر أولًا.</small>
              </label>
              {editor.kind === "accreditation" ? <label className={styles.wide}>ملاحظة داخلية للاعتماد (اختياري)
                <input value={editor.rightsReference} onChange={(event) => setEditor((current) => ({ ...current, rightsReference: event.target.value }))} maxLength={500} placeholder="ملاحظة للإدارة" />
              </label> : null}
              {editor.kind === "accreditation" ? <label className={styles.consent}>
                <input type="checkbox" checked={editor.rightsConfirmed} onChange={(event) => setEditor((current) => ({ ...current, rightsConfirmed: event.target.checked }))} />
                <span><BadgeCheck size={19} /><b>أنا مخوّل بإضافة هذا الشعار</b><small>تأكيد واحد مطلوب عند النشر.</small></span>
              </label> : null}
            </div>
            <button className={styles.primaryButton} disabled={saving}>
              {saving ? <LoaderCircle className={styles.spin} size={18} /> : <Save size={18} />}
              {editor.id ? "حفظ التعديلات" : "إضافة السجل"}
            </button>
          </form>

          <section className={styles.library}>
            <div className={styles.sectionHeading}>
              <div><span>مكتبة الهوية</span><h2>السجلات المحفوظة</h2></div>
              <button type="button" className={styles.addButton} onClick={() => { resetEditor(); editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                <Plus size={15} /> إضافة
              </button>
            </div>
            <div className={styles.filters}>
              <label className={styles.searchField}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو المرجع" /></label>
              <SearchableSelect aria-label="تصفية حسب التصنيف" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as "all" | PartnerKind)}>
                <option value="all">كل التصنيفات</option><option value="partner">الشركاء</option><option value="accreditation">الاعتمادات والتراخيص</option><option value="payment">شركاء الدفع</option>
              </SearchableSelect>
              <SearchableSelect aria-label="تصفية حسب الحالة" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | PartnerStatus)}>
                <option value="all">كل الحالات</option><option value="published">المنشورة</option><option value="draft">المسودات</option><option value="hidden">المخفية</option>
              </SearchableSelect>
            </div>
            {loading ? (
              <div className={styles.loading}><LoaderCircle className={styles.spin} /><span>جارٍ تحميل السجلات...</span></div>
            ) : filteredPartners.length === 0 ? (
              <div className={styles.empty}>
                <Handshake size={32} /><h3>{partners.length ? "لا توجد نتائج مطابقة" : "لم تُضف سجلات بعد"}</h3>
                <p>{partners.length ? "غيّر البحث أو مرشحات العرض." : "ابدأ بإضافة شريك أو اعتماد، واحفظه كمسودة حتى تكتمل الموافقة."}</p>
              </div>
            ) : (
              <div className={styles.cards}>
                {filteredPartners.map((partner) => {
                  const Icon = partnerIcon(partner.kind);
                  return (
                    <article key={partner.id} className={styles.card}>
                      <header>
                        <div className={styles.logo}>{partner.logo ? <Image src={partner.logo} alt={"شعار " + partner.name} width={120} height={70} unoptimized /> : <Icon />}</div>
                        <div className={styles.cardBadges}>
                          <span className={[styles.status, styles["status_" + partner.status]].filter(Boolean).join(" ")}>
                            {partner.status === "hidden" ? <EyeOff size={12} /> : partner.status === "published" ? <CheckCircle2 size={12} /> : null}{STATUS_LABELS[partner.status]}
                          </span>
                          <span className={styles.kind}><Icon size={12} /> {KIND_LABELS[partner.kind]}</span>
                        </div>
                      </header>
                      <div className={styles.cardBody}>
                        <h3>{partner.name}</h3><p>{partner.description || "لا يوجد وصف مضاف لهذا السجل."}</p>
                        <dl>
                          <div><dt>الترتيب</dt><dd>{partner.sortOrder.toLocaleString("ar-SA")}</dd></div>
                          <div><dt>حق الاستخدام</dt><dd className={partner.rightsConfirmed ? styles.confirmed : styles.unconfirmed}>{partner.rightsConfirmed ? "مؤكد" : "غير مؤكد"}</dd></div>
                          {partner.credentialNumber ? <div><dt>رقم الاعتماد</dt><dd dir="ltr">{partner.credentialNumber}</dd></div> : null}
                        </dl>
                        {partner.rightsReference ? <div className={styles.reference}><FileCheck2 size={14} /><span>{partner.rightsReference}</span></div> : null}
                        <small className={styles.updated}>آخر تحديث: {formatDate(partner.updatedAt)}</small>
                      </div>
                      <footer>
                        {partner.verificationUrl ? <a href={partner.verificationUrl} target="_blank" rel="noopener noreferrer"><BadgeCheck size={14} /> تحقق</a> : null}
                        {partner.destinationUrl ? <a href={partner.destinationUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> موقع الجهة</a> : null}
                        <button type="button" onClick={() => editPartner(partner)}><Pencil size={14} /> تعديل</button>
                        <button type="button" className={styles.deleteButton} onClick={() => void deletePartner(partner)} disabled={deletingId === partner.id}>
                          {deletingId === partner.id ? <LoaderCircle className={styles.spin} size={14} /> : <Trash2 size={14} />} حذف
                        </button>
                      </footer>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
