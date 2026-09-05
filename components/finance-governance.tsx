"use client";
import { SearchableSelect } from "@/components/searchable-select";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, LoaderCircle, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { ADMIN_STEP_UP_MESSAGE, AdminMfaNotice, isAdminStepUpMessage, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import { currencyMinorDigits } from "@/lib/settlements";
import styles from "./finance-governance.module.css";

export type RefundPrefill = { orderNumber: string; amount: number; reason?: string; nonce: number };

type Approval = { id:number;approverEmail:string;decision:string;note:string|null;createdAt:string };
type RefundRow = { id:number;requestNumber:string;orderNumber:string;requestedByEmail:string;amountMinor:number;currency:string;reason:string;status:string;providerRefundId:string|null;createdAt:string;approvals:Approval[] };
type Settlement = { id:number;providerSettlementId:string;currency:string;status:string;grossMinor:number;refundMinor:number;feeMinor:number;netMinor:number;createdAt:string;lines:Array<{status:string;count:number}> };

const statusLabel:Record<string,string>={pending:"بانتظار المراجعة",first_approved:"موافقة أولى",approved_pending_provider:"مكتمل الموافقات",provider_processing:"جارٍ الإرسال إلى Tap",provider_pending:"قيد المعالجة لدى Tap",provider_failed:"تعذر الإرسال/المعالجة",completed:"مكتمل",rejected:"مرفوض",reconciled:"مطابق",partially_reconciled:"مطابق جزئيًا",needs_review:"يحتاج مراجعة",imported:"مستورد"};
const settlementIssueLabel:Record<string,string>={unmatched:"غير مرتبط بطلب",duplicate_order:"الطلب مكرر في الكشف",identifier_conflict:"تعارض بين رقم الطلب ومعرّف Tap",currency_mismatch:"اختلاف العملة",order_not_captured:"الطلب غير محصل",gross_mismatch:"اختلاف المبلغ الإجمالي",refund_mismatch:"قيمة الاسترداد غير صحيحة",refund_status_mismatch:"الاسترداد لم تؤكده حالة الطلب",arithmetic_mismatch:"معادلة الصافي غير متطابقة"};
const money=(minor:number,currency="SAR")=>new Intl.NumberFormat("ar-SA",{style:"currency",currency}).format(minor/(10**currencyMinorDigits(currency)));
const settlementIssues=(lines:Settlement["lines"])=>Object.entries(lines.filter((line)=>line.status!=="matched").reduce((counts,line)=>({...counts,[line.status]:(counts[line.status]||0)+line.count}),{} as Record<string,number>)).map(([status,count])=>`${settlementIssueLabel[status]||status}: ${count.toLocaleString("ar-SA")}`).join(" · ");

export function FinanceGovernance({ prefill, refreshKey = 0 }: { prefill?: RefundPrefill | null; refreshKey?: number } = {}) {
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const refundFormRef = useRef<HTMLFormElement | null>(null);
  const appliedPrefill = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [refundResponse, settlementResponse] = await Promise.all([
        fetch("/api/admin/refunds", { cache: "no-store" }),
        fetch("/api/admin/settlements", { cache: "no-store" }),
      ]);
      const refundPayload = await refundResponse.json();
      const settlementPayload = await settlementResponse.json();
      if (!refundResponse.ok) throw new Error(refundPayload.error || "تعذر تحميل طلبات الاسترداد");
      if (!settlementResponse.ok) throw new Error(settlementPayload.error || "تعذر تحميل التسويات");
      setRefunds(refundPayload.requests || []);
      setSettlements(settlementPayload.settlements || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل الحوكمة المالية");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, refreshKey]);
  useEffect(() => {
    if (!prefill || prefill.nonce === appliedPrefill.current || !refundFormRef.current) return;
    appliedPrefill.current = prefill.nonce;
    const form = refundFormRef.current;
    const orderInput = form.elements.namedItem("orderNumber") as HTMLInputElement | null;
    const amountInput = form.elements.namedItem("amount") as HTMLInputElement | null;
    const reasonInput = form.elements.namedItem("reason") as HTMLTextAreaElement | null;
    if (orderInput) orderInput.value = prefill.orderNumber;
    if (amountInput) amountInput.value = prefill.amount.toFixed(2);
    if (reasonInput && prefill.reason) reasonInput.value = prefill.reason;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    reasonInput?.focus();
  }, [prefill]);

  async function refundAction(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setMessage("");
    try {
      const response = await fetch("/api/admin/refunds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
      if (!response.ok) throw new Error(result.error || "تعذر تنفيذ الإجراء");
      setMessage(result.message || `تم تحديث الطلب: ${statusLabel[result.status] || result.status || "ناجح"}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تنفيذ الإجراء");
    } finally {
      setBusy("");
    }
  }

  return <section className={styles.section}>
    <header><div><span><ShieldCheck size={18} /></span><div><h2>الاستردادات والتسويات</h2><p>فصل منشئ الطلب عن الموافقين، موافقتان مستقلتان، ومطابقة كشف Tap بالهللة.</p></div></div><button type="button" onClick={() => void load()} aria-label="تحديث"><RotateCcw size={16} /></button></header>
    {message && (isAdminStepUpMessage(message) ? <AdminMfaNotice compact /> : <div className={styles.notice}>{message}</div>)}
    {loading ? <div className={styles.loading}><LoaderCircle className="spin" /> جارٍ تحميل السجلات…</div> : <div className={styles.columns}>
      <div className={styles.column}>
        <form ref={refundFormRef} className={styles.form} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void refundAction({ action: "create", orderNumber: form.get("orderNumber"), amount: form.get("amount"), reason: form.get("reason") }, "create"); }}>
          <h3>طلب استرداد جديد</h3>
          <label>رقم الطلب<input name="orderNumber" dir="ltr" required /></label>
          <label>المبلغ بالريال<input name="amount" type="number" min="0.01" step="0.01" required /></label>
          <label>سبب القرار<textarea name="reason" minLength={8} required /></label>
          <button disabled={busy === "create"}>{busy === "create" ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />} إنشاء للمراجعة</button>
        </form>
        <div className={styles.list}>{refunds.map((row) => {
          const approved = row.approvals.filter((item) => item.decision === "approved");
          return <article key={row.id}>
            <header><span><strong dir="ltr">{row.requestNumber}</strong><small dir="ltr">{row.orderNumber}</small></span><em>{statusLabel[row.status] || row.status}</em></header>
            <p>{row.reason}</p><b>{money(row.amountMinor, row.currency)}</b>
            <small>{approved.length}/2 موافقات · المنشئ: <bdi dir="ltr">{row.requestedByEmail}</bdi></small>
            {approved.length > 0 && <small className={styles.approvals}>الموافقون: {approved.map((item) => item.approverEmail).join("، ")}</small>}
            {["pending", "first_approved", "provider_failed", "approved_pending_provider"].includes(row.status) && <div>
              <button disabled={Boolean(busy)} onClick={() => { if (window.confirm("تأكيد اعتماد هذا الاسترداد؟ لا يجوز أن يكون الموافق هو منشئ الطلب.")) void refundAction({ action: "approve", id: row.id }, `approve-${row.id}`); }}><CheckCircle2 size={14} /> اعتماد</button>
              <button className={styles.reject} disabled={Boolean(busy)} onClick={() => { const note = window.prompt("اكتب سبب رفض طلب الاسترداد"); if (note?.trim()) void refundAction({ action: "reject", id: row.id, note }, `reject-${row.id}`); }}><XCircle size={14} /> رفض</button>
            </div>}
          </article>;
        })}{!refunds.length && <p className={styles.empty}>لا توجد طلبات استرداد.</p>}</div>
      </div>

      <div className={styles.column}>
        <form className={styles.form} onSubmit={async (event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          const file = form.get("file");
          if (!(file instanceof File)) return;
          setBusy("settlement"); setMessage("");
          try {
            const query = new URLSearchParams({ id: String(form.get("id") || ""), currency: String(form.get("currency") || "SAR") });
            const from = String(form.get("from") || ""); const to = String(form.get("to") || "");
            if (from) query.set("from", from); if (to) query.set("to", to);
            const response = await fetch(`/api/admin/settlements?${query}`, { method: "POST", headers: { "content-type": "text/csv" }, body: file });
            const result = await response.json();
            if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
            if (!response.ok) throw new Error(result.error || "تعذر استيراد التسوية");
            const issues = Object.entries(result.settlement.issueCounts || {}).map(([status, count]) => `${settlementIssueLabel[status] || status}: ${Number(count).toLocaleString("ar-SA")}`).join(" · ");
            setMessage(`تمت مطابقة ${result.settlement.matched} وبقي ${result.settlement.unmatched}${issues ? ` · ${issues}` : ""}`);
            formElement.reset();
            await load();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "تعذر استيراد التسوية");
          } finally {
            setBusy("");
          }
        }}>
          <h3>استيراد كشف تسوية Tap</h3>
          <label>رقم الكشف<input name="id" dir="ltr" required /></label>
          <label>العملة<SearchableSelect name="currency" defaultValue="SAR"><option value="SAR">SAR</option><option value="AED">AED</option><option value="KWD">KWD</option><option value="BHD">BHD</option></SearchableSelect></label>
          <label>بداية الفترة<input name="from" type="date" /></label><label>نهاية الفترة<input name="to" type="date" /></label>
          <label>ملف CSV<input name="file" type="file" accept=".csv,text/csv" required /></label>
          <small>الأعمدة: charge_id أو transaction_id، order_number، gross، refund (اختياري)، fee، tax، net. لا تُعتمد المطابقة عند اختلاف المعرّف أو العملة أو الإجمالي أو معادلة الصافي.</small>
          <button disabled={busy === "settlement"}>{busy === "settlement" ? <LoaderCircle className="spin" size={15} /> : <FileSpreadsheet size={15} />} فحص واستيراد</button>
        </form>
        <div className={styles.list}>{settlements.map((row) => {
          const issues = settlementIssues(row.lines);
          const matched = row.lines.filter((line) => line.status === "matched").reduce((sum, line) => sum + line.count, 0);
          const total = row.lines.reduce((sum, line) => sum + line.count, 0);
          return <article key={row.id}><header><span><strong dir="ltr">{row.providerSettlementId}</strong><small>{new Date(row.createdAt).toLocaleDateString("ar-SA")}</small></span><em>{statusLabel[row.status] || row.status}</em></header><b>{money(row.netMinor, row.currency)}</b><small>إجمالي {money(row.grossMinor, row.currency)} · استرداد {money(row.refundMinor || 0, row.currency)} · رسوم {money(row.feeMinor, row.currency)} · {matched}/{total} مطابق</small>{issues && <small className={styles.issues}>{issues}</small>}</article>;
        })}{!settlements.length && <p className={styles.empty}>لم تُستورد تسويات بعد.</p>}</div>
      </div>
    </div>}
  </section>;
}
