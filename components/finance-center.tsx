"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeDollarSign,
  Banknote,
  Download,
  Landmark,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { ADMIN_STEP_UP_MESSAGE, AdminMfaNotice, isAdminStepUpMessage, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import { useRealtimeSync } from "@/components/realtime-sync";
import styles from "./finance-center.module.css";
import { FinanceGovernance, type RefundPrefill } from "./finance-governance";

type FilterState = {
  from: string;
  to: string;
  institution: string;
  course: string;
  paymentMethod: string;
  status: string;
  search: string;
};

type QueueItem = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
  paymentLabel: string;
  createdAt: string;
  ageHours: number;
};

type OrderSummary = {
  orderNumber: string;
  date: string;
  customerName: string;
  customerEmail: string;
  status: string;
  statusLabel: string;
  paymentLabel: string;
  institutions: string;
  courses: string;
  itemCount: number;
  gross: number;
  refund: number;
  refundComplete: boolean;
  net: number;
  currency: string;
};

type FinanceData = {
  generatedAt: string;
  filters: FilterState;
  options: {
    institutions: Array<{ slug: string; name: string }>;
    courses: Array<{ slug: string; title: string; institutionSlug: string }>;
    paymentMethods: Array<{ method: string; label: string }>;
    statuses: Array<{ status: string; label: string }>;
  };
  metrics: {
    gross: number;
    refunds: number;
    net: number;
    discounts: number;
    tax: number;
    capturedOrders: number;
    averageOrderValue: number;
    unresolvedRefundOrders: number;
    aiGross?: number;
    aiNet?: number;
    aiPaidOrders?: number;
  };
  queue: { verificationPending: QueueItem[]; paymentReview: QueueItem[] };
  breakdown: {
    paymentMethods: Array<{ method: string; label: string; orders: number; net: number }>;
    institutions: Array<{ institution: string; orders: number; net: number }>;
    trend: Array<{ date: string; gross: number; refunds: number; net: number; orders: number }>;
  };
  orders: OrderSummary[];
  aiSubscriptions?: { orders: number; paidOrders: number; gross: number; net: number; rows: Array<OrderSummary & { typeLabel: string; subtotal: number; entitlementExpiresAt: string | null }> };
};

type OrderDetail = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  status: string;
  statusLabel: string;
  paymentLabel: string;
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
  net: number;
  createdAt: string;
  paidAt: string | null;
  tapChargeId: string | null;
  refund: { amount: number; complete: boolean; source: string };
  invoice: { invoiceNumber: string; total: number; taxAmount: number; currency: string; issuedAt: string; pdfObjectKey: string | null } | null;
  items: Array<{ id: number; courseSlug: string; title: string; institutionName: string; unitPrice: number; discount: number; total: number; accessDurationDays: number }>;
  access: Array<{
    id: number;
    courseSlug: string;
    courseTitle: string;
    startsAt: string;
    expiresAt: string | null;
    suspendedAt: string | null;
    revokedAt: string | null;
    events: Array<{ id: number; action: string; actorEmail: string | null; reason: string | null; createdAt: string }>;
  }>;
  paymentEvents: Array<{ id: number; provider: string; providerEventId: string | null; chargeId: string | null; status: string; receivedAt: string }>;
  refundRequests?: Array<{ id: number; requestNumber: string; amount: number; currency: string; status: string; reason: string; requestedByEmail: string; createdAt: string; completedAt: string | null }>;
  creditNotes?: Array<{ id: number; creditNoteNumber: string; invoiceNumber: string; amount: number; taxAmount: number; currency: string; reason: string; refundRequestNumber: string | null; issuedAt: string }>;
  reviewable?: boolean;
};

const refundStatusLabel: Record<string, string> = { pending: "بانتظار المراجعة", first_approved: "موافقة أولى", approved_pending_provider: "مكتمل الموافقات", provider_processing: "جارٍ الإرسال إلى Tap", provider_pending: "قيد المعالجة لدى Tap", provider_failed: "تعذر الإرسال", completed: "مكتمل", rejected: "مرفوض" };

const EMPTY_FILTERS: FilterState = { from: "", to: "", institution: "", course: "", paymentMethod: "", status: "", search: "" };

function money(value: number, currency = "SAR") {
  return new Intl.NumberFormat("ar-SA", { style: "currency", currency, minimumFractionDigits: 2 }).format(value || 0);
}

function dateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date) : "—";
}

function buildParams(filters: FilterState) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value.trim()) params.set(key, value.trim());
  return params;
}

function MetricCard({ label, value, hint, tone, icon }: { label: string; value: string; hint: string; tone?: string; icon: React.ReactNode }) {
  return <article className={styles.metric} data-tone={tone}>
    <div className={styles.metricHead}>{icon}<span>{label}</span></div>
    <div><strong>{value}</strong><small>{hint}</small></div>
  </article>;
}

function QueuePanel({ title, description, items, icon, onOpen }: { title: string; description: string; items: QueueItem[]; icon: React.ReactNode; onOpen: (orderNumber: string) => void }) {
  return <section className={styles.panel}>
    <header className={styles.panelHeader}><div><h2>{title}</h2><p>{description}</p></div><span className={styles.count}>{icon}{items.length}</span></header>
    {items.length ? <div className={styles.queueList}>{items.map((item) => <button type="button" className={styles.queueItem} key={item.orderNumber} onClick={() => onOpen(item.orderNumber)}>
      <strong>{item.customerName}</strong><span>{money(item.total)}</span>
      <small><bdi className={styles.ltr}>{item.orderNumber}</bdi> · منذ {item.ageHours.toLocaleString("ar-SA")} ساعة</small><small>{item.paymentLabel}</small>
    </button>)}</div> : <div className={styles.empty}>لا توجد طلبات في هذا الطابور.</div>}
  </section>;
}

function BreakdownPanel({ title, description, items }: { title: string; description: string; items: Array<{ label: string; value: number; meta: string }> }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return <section className={styles.panel}>
    <header className={styles.panelHeader}><div><h2>{title}</h2><p>{description}</p></div></header>
    {items.length ? <div className={styles.breakdown}>{items.slice(0, 8).map((item) => <div className={styles.breakdownItem} key={item.label}>
      <span>{item.label}</span><div className={styles.bar} aria-hidden="true"><i style={{ width: `${Math.max(4, item.value / max * 100)}%` }} /></div><b title={item.meta}>{money(item.value)}</b>
    </div>)}</div> : <div className={styles.empty}>لا توجد بيانات مالية ضمن المرشحات الحالية.</div>}
  </section>;
}

function DetailDrawer({ detail, loading, error, onClose, onApprove, onRefund, actionBusy, actionMessage }: { detail: OrderDetail | null; loading: boolean; error: string; onClose: () => void; onApprove: (orderNumber: string) => void; onRefund: (detail: OrderDetail) => void; actionBusy: boolean; actionMessage: string }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = previous; };
  }, [onClose]);

  return <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="finance-order-title">
      <header className={styles.drawerHeader}><div><h2 id="finance-order-title">تفاصيل الطلب</h2><p>{detail ? <bdi className={styles.ltr}>{detail.orderNumber}</bdi> : "جاري تحميل السجل الكامل"}</p></div><button type="button" className={styles.iconButton} aria-label="إغلاق التفاصيل" onClick={onClose}><X size={19} /></button></header>
      {loading ? <div className={styles.loading}><div><div className={styles.spinner} /><p>نجمع تفاصيل الطلب…</p></div></div> : error ? <div className={`${styles.alert} ${styles.error}`}><AlertTriangle size={18} />{error}</div> : detail ? <>
        <div className={styles.detailMetrics}>
          <div className={styles.detailMetric}><span>المبلغ المحصل</span><strong>{money(detail.total, detail.currency)}</strong></div>
          <div className={styles.detailMetric}><span>المبلغ المسترد</span><strong>{money(detail.refund.amount, detail.currency)}</strong></div>
          <div className={styles.detailMetric}><span>الصافي</span><strong>{money(detail.net, detail.currency)}</strong></div>
        </div>
        {!detail.refund.complete && <div className={styles.alert}><AlertTriangle size={18} /><span>وصلت حالة استرداد جزئي، لكن الحدث المحفوظ لا يتضمن المبلغ. أدرجنا الطلب ضمن تنبيهات المطابقة ولم نفترض قيمة غير مؤكدة.</span></div>}
        {actionMessage && (isAdminStepUpMessage(actionMessage) ? <AdminMfaNotice compact /> : <div className={styles.alert}><ShieldAlert size={18} /><span>{actionMessage}</span></div>)}
        {detail.reviewable && <section className={`${styles.detailSection} ${styles.decisionPanel}`}><h3>قرار المراجعة المالية</h3><p>{detail.status === "payment_review" ? "استُلمت الدفعة لكن التفعيل توقف (كوبون لم يُقبل أو اشتراك قائم). اعتماد الدفعة يفعّل المواد ويصدر الفاتورة ويمدد أي اشتراك قائم، أو أنشئ طلب استرداد محكومًا بموافقتين." : "لم تؤكد بوابة الدفع نتيجة العملية بعد. اعتمد الدفعة فقط إذا تحققت من التحصيل في لوحة Tap، أو أنشئ طلب استرداد."}</p><div className={styles.decisionActions}><button type="button" className={styles.primaryButton} disabled={actionBusy} onClick={() => onApprove(detail.orderNumber)}>{actionBusy ? <RefreshCw className={styles.spinIcon} size={16} /> : <ShieldAlert size={16} />} اعتماد الدفعة وتفعيل المواد</button><button type="button" className={styles.softButton} disabled={actionBusy} onClick={() => onRefund(detail)}><RotateCcw size={16} /> إنشاء طلب استرداد</button></div></section>}
        {!detail.reviewable && ["paid", "partially_refunded"].includes(detail.status) && detail.tapChargeId && <div className={styles.detailActions}><button type="button" className={styles.softButton} onClick={() => onRefund(detail)}><RotateCcw size={16} /> طلب استرداد لهذا الطلب</button></div>}
        <section className={styles.detailSection}><h3>بيانات الطلب والطالب</h3>
          <div className={styles.detailRow}><span>الحالة</span><b><span className={styles.badge} data-state={detail.status}>{detail.statusLabel}</span></b></div>
          <div className={styles.detailRow}><span>الطالب</span><b>{detail.customerName}</b></div>
          <div className={styles.detailRow}><span>البريد</span><bdi className={styles.ltr}>{detail.customerEmail}</bdi></div>
          <div className={styles.detailRow}><span>الجوال</span><bdi className={styles.ltr}>{detail.customerPhone || "—"}</bdi></div>
          <div className={styles.detailRow}><span>طريقة الدفع</span><b>{detail.paymentLabel}</b></div>
          <div className={styles.detailRow}><span>إنشاء الطلب</span><b>{dateTime(detail.createdAt)}</b></div>
          <div className={styles.detailRow}><span>وقت التحصيل</span><b>{dateTime(detail.paidAt)}</b></div>
          <div className={styles.detailRow}><span>عملية Tap</span><bdi className={styles.ltr}>{detail.tapChargeId || "—"}</bdi></div>
        </section>
        <section className={styles.detailSection}><h3>كل عناصر الطلب ({detail.items.length.toLocaleString("ar-SA")})</h3>{detail.items.map((item) => <div className={styles.itemCard} key={`${item.id}:${item.courseSlug}`}>
          <strong>{item.title}</strong><small>{item.institutionName} · وصول {item.accessDurationDays.toLocaleString("ar-SA")} يومًا</small><small>{money(item.unitPrice)} − خصم {money(item.discount)} = <b>{money(item.total)}</b></small>
        </div>)}</section>
        <section className={styles.detailSection}><h3>الفاتورة</h3>{detail.invoice ? <>
          <div className={styles.detailRow}><span>رقم الفاتورة</span><bdi className={styles.ltr}>{detail.invoice.invoiceNumber}</bdi></div>
          <div className={styles.detailRow}><span>الإجمالي</span><b>{money(detail.invoice.total, detail.invoice.currency)}</b></div>
          <div className={styles.detailRow}><span>الضريبة المضمنة</span><b>{money(detail.invoice.taxAmount, detail.invoice.currency)}</b></div>
          <div className={styles.detailRow}><span>تاريخ الإصدار</span><b>{dateTime(detail.invoice.issuedAt)}</b></div>
          <div className={styles.detailRow}><span>نسخة الفاتورة</span><Link href={`/invoices/${encodeURIComponent(detail.orderNumber)}`} target="_blank">فتح / طباعة PDF</Link></div>
        </> : <div className={styles.empty}>لا توجد فاتورة صادرة لهذا الطلب حتى الآن.</div>}</section>
        <section className={styles.detailSection}><h3>الوصول إلى المواد</h3>{detail.access.length ? detail.access.map((access) => <div className={styles.itemCard} key={access.id}>
          <strong>{access.courseTitle}</strong><small>{access.revokedAt ? "ملغي" : access.suspendedAt ? "موقوف" : "نشط"} · من {dateTime(access.startsAt)} إلى {dateTime(access.expiresAt)}</small>
          {access.events.length > 0 && <small>آخر إجراء: {access.events[0].action} · {dateTime(access.events[0].createdAt)}</small>}
        </div>) : <div className={styles.empty}>لم يُربط وصول بهذا الطلب.</div>}</section>
        {(detail.refundRequests?.length || detail.creditNotes?.length) ? <section className={styles.detailSection}><h3>الاستردادات وإشعارات الدائن</h3>{detail.refundRequests?.map((refund) => <div className={styles.itemCard} key={`refund-${refund.id}`}><strong><bdi className={styles.ltr}>{refund.requestNumber}</bdi> · {money(refund.amount, refund.currency)}</strong><small>{refundStatusLabel[refund.status] || refund.status} · طلبه {refund.requestedByEmail} · {dateTime(refund.createdAt)}</small><small>{refund.reason}</small></div>)}{detail.creditNotes?.map((note) => <div className={styles.itemCard} key={`credit-${note.id}`}><strong>إشعار دائن <bdi className={styles.ltr}>{note.creditNoteNumber}</bdi> · {money(note.amount, note.currency)}</strong><small>للفاتورة <bdi className={styles.ltr}>{note.invoiceNumber}</bdi> · ضريبة {money(note.taxAmount, note.currency)} · {dateTime(note.issuedAt)}</small><small>{note.reason}</small></div>)}</section> : null}
        <section className={styles.detailSection}><h3>تسلسل أحداث الدفع</h3>{detail.paymentEvents.length ? <div className={styles.timeline}>{detail.paymentEvents.map((event) => <div className={styles.timelineItem} key={event.id}>
          <strong><bdi className={styles.ltr}>{event.status}</bdi></strong><small>{dateTime(event.receivedAt)} · {event.provider}</small><small><bdi className={styles.ltr}>{event.chargeId || event.providerEventId || "—"}</bdi></small>
        </div>)}</div> : <div className={styles.empty}>لم تصل أحداث من بوابة الدفع بعد.</div>}</section>
      </> : null}
    </aside>
  </div>;
}

export function FinanceCenter({ adminName }: { adminName: string }) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState("");
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [refundPrefill, setRefundPrefill] = useState<RefundPrefill | null>(null);
  const [governanceKey, setGovernanceKey] = useState(0);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const detailRequest = useRef(0);
  const lastLoad = useRef(0);

  const load = useCallback(async (next: FilterState, signal?: AbortSignal, silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    lastLoad.current = Date.now();
    try {
      const response = await fetch(`/api/admin/finance?${buildParams(next)}`, { cache: "no-store", signal });
      const payload = await response.json() as FinanceData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "تعذر تحميل المركز المالي");
      setData(payload);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل المركز المالي");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(appliedFilters, controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [appliedFilters, load]);
  useRealtimeSync((payload) => {
    if (payload.changed && !payload.changed.includes("admin") && !payload.changed.includes("commerce")) return;
    if (Date.now() - lastLoad.current < 5000) return;
    void load(appliedFilters, undefined, true);
  });

  const closeDetail = useCallback(() => { detailRequest.current += 1; setSelectedOrder(""); setDetail(null); setDetailError(""); setDetailLoading(false); setActionMessage(""); }, []);
  const openDetail = useCallback(async (orderNumber: string) => {
    const requestId = detailRequest.current + 1;
    detailRequest.current = requestId;
    setSelectedOrder(orderNumber);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/finance?order=${encodeURIComponent(orderNumber)}`, { cache: "no-store" });
      const payload = await response.json() as { order?: OrderDetail; error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "تعذر تحميل تفاصيل الطلب");
      if (detailRequest.current === requestId) setDetail(payload.order);
    } catch (detailLoadError) {
      if (detailRequest.current === requestId) setDetailError(detailLoadError instanceof Error ? detailLoadError.message : "تعذر تحميل تفاصيل الطلب");
    } finally { if (detailRequest.current === requestId) setDetailLoading(false); }
  }, []);

  const approveReview = useCallback(async (orderNumber: string) => {
    const reason = window.prompt("سبب اعتماد الدفعة (يُسجل في سجل التدقيق)", "تم التحقق من التحصيل في لوحة Tap");
    if (!reason || reason.trim().length < 4) return;
    setActionBusy(true); setActionMessage("");
    try {
      const response = await fetch("/api/admin/finance", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resolvePaymentReview", orderNumber, decision: "approve", reason: reason.trim() }) });
      const payload = await response.json() as { error?: string };
      if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
      if (!response.ok) throw new Error(payload.error || "تعذر اعتماد الدفعة");
      setActionMessage("تم اعتماد الدفعة وتفعيل المواد وإصدار الفاتورة وإشعار الطالب.");
      await Promise.all([openDetail(orderNumber), load(appliedFilters, undefined, true)]);
    } catch (approveError) {
      setActionMessage(approveError instanceof Error ? approveError.message : "تعذر اعتماد الدفعة");
    } finally { setActionBusy(false); }
  }, [appliedFilters, load, openDetail]);
  const startRefund = useCallback((target: OrderDetail) => {
    setRefundPrefill({ orderNumber: target.orderNumber, amount: Math.max(0, target.total - target.refund.amount), reason: target.reviewable ? `قرار المراجعة المالية للطلب ${target.orderNumber}: ` : "", nonce: Date.now() });
    closeDetail();
  }, [closeDetail]);
  const exportCsv = useCallback(async () => {
    setExporting(true); setExportError("");
    try {
      const params = buildParams(appliedFilters); params.set("format", "csv");
      const response = await fetch(`/api/admin/finance?${params}`, { cache: "no-store", credentials: "same-origin" });
      if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
      if (!response.ok) { const payload = await response.json().catch(() => ({})) as { error?: string }; throw new Error(payload.error || "تعذر تصدير البيانات المالية"); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `meras-finance-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click();
      URL.revokeObjectURL(url);
    } catch (csvError) {
      setExportError(csvError instanceof Error ? csvError.message : "تعذر تصدير البيانات المالية");
    } finally { setExporting(false); }
  }, [appliedFilters]);

  const visibleCourses = useMemo(() => data?.options.courses.filter((course) => !filters.institution || course.institutionSlug === filters.institution) || [], [data, filters.institution]);
  const paymentBreakdown = data?.breakdown.paymentMethods.map((item) => ({ label: item.label, value: item.net, meta: `${item.orders} طلب` })) || [];
  const institutionBreakdown = data?.breakdown.institutions.map((item) => ({ label: item.institution, value: item.net, meta: `${item.orders} طلب` })) || [];

  return <main className={styles.page}>
    <div className={styles.shell}>
      <AdminCenterNav />
      <header className={styles.topbar}>
        <div className={styles.title}><span className={styles.titleIcon}><BadgeDollarSign size={25} /></span><div><h1>المركز المالي</h1><p>صورة مالية متكاملة لجميع الطلبات — مرحبًا {adminName}</p></div></div>
        <div className={styles.topActions}><button type="button" className={styles.primaryButton} disabled={exporting} onClick={() => void exportCsv()}><Download size={17} />{exporting ? "جارٍ التصدير…" : "تصدير CSV"}</button></div>
      </header>
      {exportError && (isAdminStepUpMessage(exportError) ? <AdminMfaNotice /> : <div className={`${styles.alert} ${styles.error}`}><AlertTriangle size={18} /><span>{exportError}</span></div>)}

      <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); setAppliedFilters({ ...filters }); }}>
        <label className={styles.field}><span>من تاريخ</span><input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
        <label className={styles.field}><span>إلى تاريخ</span><input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
        <label className={styles.field}><span>الجامعة</span><select value={filters.institution} onChange={(event) => setFilters((current) => ({ ...current, institution: event.target.value, course: "" }))}><option value="">كل الجامعات</option>{data?.options.institutions.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select></label>
        <label className={styles.field}><span>المادة</span><select value={filters.course} onChange={(event) => setFilters((current) => ({ ...current, course: event.target.value }))}><option value="">كل المواد</option>{visibleCourses.map((item) => <option value={item.slug} key={item.slug}>{item.title}</option>)}</select></label>
        <label className={styles.field}><span>طريقة الدفع</span><select value={filters.paymentMethod} onChange={(event) => setFilters((current) => ({ ...current, paymentMethod: event.target.value }))}><option value="">كل طرق الدفع</option>{data?.options.paymentMethods.map((item) => <option value={item.method} key={item.method}>{item.label}</option>)}</select></label>
        <label className={styles.field}><span>الحالة</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">كل الحالات</option>{data?.options.statuses.map((item) => <option value={item.status} key={item.status}>{item.label}</option>)}</select></label>
        <label className={styles.field} style={{ gridColumn: "span 2" }}><span>بحث مباشر</span><input type="search" value={filters.search} placeholder="رقم الطلب، الطالب، البريد أو عملية Tap" onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} /></label>
        <div className={styles.filterActions}><button className={styles.softButton} type="button" onClick={() => { setFilters(EMPTY_FILTERS); setAppliedFilters(EMPTY_FILTERS); }}><RotateCcw size={16} />إعادة الضبط</button><button className={styles.primaryButton} type="submit"><Search size={16} />تطبيق المرشحات</button><button className={styles.iconButton} type="button" aria-label="تحديث البيانات" onClick={() => void load(appliedFilters)}><RefreshCw size={17} /></button></div>
      </form>

      {error && <div className={`${styles.alert} ${styles.error}`}><AlertTriangle size={18} /><span>{error}</span></div>}
      {loading && !data ? <div className={styles.loading}><div><div className={styles.spinner} /><p>نحسب البيانات المالية من كامل السجلات…</p></div></div> : data ? <>
        <section className={styles.metrics} aria-label="المؤشرات المالية">
          <MetricCard label="إجمالي المحصل" value={money(data.metrics.gross)} hint={`${data.metrics.capturedOrders.toLocaleString("ar-SA")} طلبًا محصلًا`} icon={<TrendingUp size={18} />} />
          <MetricCard label="الاستردادات" value={money(data.metrics.refunds)} hint="كامل وجزئي من أحداث الدفع" tone="red" icon={<TrendingDown size={18} />} />
          <MetricCard label="صافي المبيعات" value={money(data.metrics.net)} hint="المحصل بعد الاستردادات" tone="green" icon={<Banknote size={18} />} />
          <MetricCard label="الخصومات" value={money(data.metrics.discounts)} hint="خصومات الطلبات المحصلة" tone="violet" icon={<ReceiptText size={18} />} />
          <MetricCard label="الضريبة المضمنة" value={money(data.metrics.tax)} hint="وفق الفواتير الصادرة" tone="amber" icon={<Landmark size={18} />} />
          <MetricCard label="متوسط الطلب" value={money(data.metrics.averageOrderValue)} hint="قبل خصم الاستردادات" icon={<WalletCards size={18} />} />
          <MetricCard label="اشتراكات مراس AI" value={money(data.metrics.aiNet || 0)} hint={`${(data.metrics.aiPaidOrders || 0).toLocaleString("ar-SA")} اشتراكًا مدفوعًا · غير مشمولة في صافي المواد`} tone="violet" icon={<BadgeDollarSign size={18} />} />
        </section>
        {data.metrics.unresolvedRefundOrders > 0 && <div className={styles.alert}><ShieldAlert size={19} /><span>هناك {data.metrics.unresolvedRefundOrders.toLocaleString("ar-SA")} طلب استرداد جزئي دون مبلغ قابل للتحقق في الحدث المحفوظ. لم نفترض مبلغًا، ويجب مطابقته مع كشف Tap.</span></div>}
        <FinanceGovernance prefill={refundPrefill} refreshKey={governanceKey} />
        {data.breakdown.trend.length > 0 && <section className={styles.panel}>
          <header className={styles.panelHeader}><div><h2>الاتجاه اليومي</h2><p>المحصل والمسترد والصافي لكل يوم ضمن المرشحات الحالية (توقيت الرياض)</p></div><span className={styles.count}>{data.breakdown.trend.length.toLocaleString("ar-SA")} يوم</span></header>
          <div className={styles.trend}>{(() => { const max = Math.max(1, ...data.breakdown.trend.map((day) => day.gross)); return data.breakdown.trend.slice(-31).map((day) => <div className={styles.trendDay} key={day.date} title={`${day.date} · ${day.orders.toLocaleString("ar-SA")} طلب`}><div className={styles.trendBars}><i style={{ height: `${Math.max(3, day.gross / max * 100)}%` }} /><b style={{ height: `${Math.max(day.refunds > 0 ? 3 : 0, day.refunds / max * 100)}%` }} /></div><span dir="ltr">{day.date.slice(5)}</span><small>{money(day.net)}</small></div>); })()}</div>
        </section>}
        {data.aiSubscriptions && data.aiSubscriptions.rows.length > 0 && <section className={styles.panel}>
          <header className={styles.panelHeader}><div><h2>اشتراكات مراس AI المدفوعة</h2><p>إيراد الاشتراك الرقمي عبر Tap — {data.aiSubscriptions.paidOrders.toLocaleString("ar-SA")} مدفوع من {data.aiSubscriptions.orders.toLocaleString("ar-SA")} طلب · صافي {money(data.aiSubscriptions.net)}</p></div><Link className={styles.link} href="/admin/ai">مركز مراس AI</Link></header>
          <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الطلب والطالب</th><th>الحالة</th><th>المبلغ</th><th>الاستحقاق</th><th>التاريخ</th></tr></thead><tbody>{data.aiSubscriptions.rows.slice(0, 50).map((row) => <tr key={row.orderNumber}><td><strong><bdi className={styles.ltr}>{row.orderNumber}</bdi></strong><small>{row.customerName} · <bdi className={styles.ltr}>{row.customerEmail}</bdi></small></td><td><span className={styles.badge} data-state={row.status}>{row.statusLabel}</span></td><td className={styles.money}>{money(row.gross || row.subtotal, row.currency)}</td><td>{row.entitlementExpiresAt ? dateTime(row.entitlementExpiresAt) : "—"}</td><td>{dateTime(row.date)}</td></tr>)}</tbody></table></div>
        </section>}
        <div className={styles.grid}>
          <section className={styles.panel}>
            <header className={styles.panelHeader}><div><h2>سجل الطلبات المالي</h2><p>كل العناصر والمبالغ ضمن المرشحات الحالية</p></div><span className={styles.count}>{data.orders.length.toLocaleString("ar-SA")}</span></header>
            {data.orders.length ? <div className={styles.tableWrap}><table className={styles.table}>
              <thead><tr><th>الطلب والطالب</th><th>الحالة</th><th>المحتوى</th><th>طريقة الدفع</th><th>المحصل</th><th>المسترد</th><th>الصافي</th><th>التاريخ</th></tr></thead>
              <tbody>{data.orders.map((order) => <tr key={order.orderNumber} tabIndex={0} onClick={() => void openDetail(order.orderNumber)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") void openDetail(order.orderNumber); }}>
                <td><strong><bdi className={styles.ltr}>{order.orderNumber}</bdi></strong><small>{order.customerName} · <bdi className={styles.ltr}>{order.customerEmail}</bdi></small></td>
                <td><span className={styles.badge} data-state={order.status}>{order.statusLabel}</span>{!order.refundComplete && <small>المبلغ يحتاج مطابقة</small>}</td>
                <td><strong>{order.itemCount.toLocaleString("ar-SA")} مادة</strong><small>{order.courses}</small></td>
                <td>{order.paymentLabel}<small>{order.institutions}</small></td>
                <td className={styles.money}>{money(order.gross, order.currency)}</td>
                <td className={`${styles.money} ${styles.refund}`}>{money(order.refund, order.currency)}</td>
                <td className={`${styles.money} ${styles.net}`}>{money(order.net, order.currency)}</td>
                <td>{dateTime(order.date)}</td>
              </tr>)}</tbody>
            </table></div> : <div className={styles.empty}>لا توجد طلبات مطابقة للمرشحات الحالية.</div>}
          </section>
          <aside className={styles.stack}>
            <QueuePanel title="بانتظار التحقق" description="عمليات لم تؤكد البوابة نتيجتها" items={data.queue.verificationPending} icon={<RefreshCw size={17} />} onOpen={(orderNumber) => void openDetail(orderNumber)} />
            <QueuePanel title="مراجعة مالية" description="دفعة محصلة تحتاج قرارًا إداريًا" items={data.queue.paymentReview} icon={<ShieldAlert size={17} />} onOpen={(orderNumber) => void openDetail(orderNumber)} />
            <BreakdownPanel title="حسب وسيلة الدفع" description="صافي المبيعات لكل وسيلة" items={paymentBreakdown} />
            <BreakdownPanel title="حسب الجامعة" description="توزيع صافي عناصر الطلبات" items={institutionBreakdown} />
          </aside>
        </div>
      </> : null}
    </div>
    {selectedOrder && <DetailDrawer detail={detail} loading={detailLoading} error={detailError} onClose={closeDetail} onApprove={(orderNumber) => void approveReview(orderNumber)} onRefund={(target) => { startRefund(target); setGovernanceKey((value) => value + 1); }} actionBusy={actionBusy} actionMessage={actionMessage} />}
  </main>;
}
