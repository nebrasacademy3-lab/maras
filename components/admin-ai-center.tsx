"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Bot, Check, CircleAlert, CircleDollarSign, Coins, Gauge, Gift,
  KeyRound, LoaderCircle, Plus, RefreshCw, Save, ShieldCheck, SlidersHorizontal,
  Sparkles, Users, X,
} from "lucide-react";
import type { AiService } from "@/lib/ai-contracts";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { ADMIN_STEP_UP_MESSAGE, AdminMfaNotice, isAdminStepUpMessage, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import { useRealtimeSync } from "@/components/realtime-sync";
import styles from "./admin-ai-center.module.css";

type ServiceSetting = { service: AiService; enabled: boolean; model: string; freeMonthlyLimit: number; subscriberMonthlyLimit: number; maxOutputTokens: number; maxFileBytes: number; temperature: number; instructions: string };
type Provider = { id: number; label: string; projectLabel: string | null; maskedKey: string; fingerprint: string; priority: number; status: string; cooldownUntil: string | null; consecutiveFailures: number; lastUsedAt: string | null; lastSuccessAt: string | null; lastErrorCode: string | null };
type Entitlement = { id: number; userId: number; email: string; fullName: string; source: string; status: string; startsAt: string; expiresAt: string | null; createdBy: string | null };
type Usage = { service: string; status: string; total: number };
type SubscriptionOrder = { id: number; orderNumber: string; userId: number; customerEmail: string; customerName: string; amount: number; currency: string; status: string; paidAt: string | null; entitlementExpiresAt: string | null; createdAt: string };
type Dashboard = { monthlyPrice: number; currency: string; settings: ServiceSetting[]; keys: Provider[]; environmentKeyCount: number; entitlements: Entitlement[]; usage: Usage[]; subscriptionOrders?: SubscriptionOrder[]; subscriptionSummary?: Array<{ status: string; total: number; amount: number }> };
type Tab = "overview" | "services" | "providers" | "subscriptions" | "orders";

const serviceNames: Record<AiService, string> = { chat: "المحادثة", summary: "تلخيص الملفات", translation: "ترجمة الشرائح", quiz: "الاختبارات التفاعلية" };
const sourceNames: Record<string, string> = { paid: "اشتراك مدفوع", admin: "منحة إدارية", gift: "هدية", referral: "إحالة", course: "اشتراك مادة" };
const orderStatusNames: Record<string, string> = { paid: "مدفوع", pending: "بانتظار الدفع", initiated: "بدأ الدفع", failed: "فشل", cancelled: "ملغي", refunded: "مسترد", verification_pending: "قيد التحقق", payment_review: "قيد المراجعة" };

async function payload<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
  if (!response.ok) throw new Error(data.error || "تعذر إكمال العملية");
  return data;
}

export function AdminAiCenter({ adminName }: { adminName: string }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [keyForm, setKeyForm] = useState({ label: "", projectLabel: "", apiKey: "", priority: 100 });
  const [grant, setGrant] = useState({ email: "", source: "admin", months: 1 });
  const [price, setPrice] = useState("30");
  const lastLoad = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy("load");
    lastLoad.current = Date.now();
    try {
      const result = await payload<Dashboard>(await fetch("/api/admin/ai", { cache: "no-store", credentials: "same-origin" }));
      setData(result); setPrice(String(result.monthlyPrice));
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر تحميل مركز الأدوات" }); }
    finally { if (!silent) setBusy(""); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useRealtimeSync((payload) => {
    if (payload.changed && !payload.changed.includes("admin") && !payload.changed.includes("settings")) return;
    if (Date.now() - lastLoad.current < 5000) return;
    void load(true);
  });

  const mutate = async (body: Record<string, unknown>, success: string, key?: string) => {
    setBusy(key || String(body.action)); setNotice(null);
    try {
      await payload(await fetch("/api/admin/ai", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
      setNotice({ tone: "ok", text: success }); await load(true); return true;
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر حفظ التغيير" }); return false; }
    finally { setBusy(""); }
  };
  const paidOrders = data?.subscriptionSummary?.find((row) => row.status === "paid");

  const updateService = (service: AiService, patch: Partial<ServiceSetting>) => setData((current) => current ? { ...current, settings: current.settings.map((setting) => setting.service === service ? { ...setting, ...patch } : setting) } : current);
  const usageTotal = useMemo(() => data?.usage.filter((row) => row.status === "succeeded").reduce((sum, row) => sum + row.total, 0) || 0, [data]);
  const failedTotal = useMemo(() => data?.usage.filter((row) => row.status === "failed" || row.status === "billable_failed").reduce((sum, row) => sum + row.total, 0) || 0, [data]);
  const activeEntitlements = data?.entitlements.filter((item) => item.status === "active").length || 0;
  const activeProviders = (data?.keys.filter((key) => key.status === "active").length || 0) + (data?.environmentKeyCount || 0);

  return <main className={styles.page} dir="rtl"><div className={styles.shell}>
    <AdminCenterNav />
    <header className={styles.header}>
      <div className={styles.heading}><span><Sparkles size={24}/></span><div><small>مركز أدوات المذاكرة</small><h1>إدارة أدوات مراس</h1><p>{adminName} · الخدمات والمزودون والحدود والاشتراكات من مكان واحد.</p></div></div>
      <div className={styles.headerActions}><button onClick={()=>void load()} disabled={busy==="load"}><RefreshCw className={busy==="load"?styles.spin:""} size={16}/> تحديث</button></div>
    </header>

    {notice && notice.tone==="error" && isAdminStepUpMessage(notice.text) ? <AdminMfaNotice /> : notice ? <div className={`${styles.notice} ${styles[notice.tone]}`}>{notice.tone==="ok"?<Check size={17}/>:<CircleAlert size={17}/>}<span>{notice.text}</span><button onClick={()=>setNotice(null)}><X size={16}/></button></div> : null}

    <section className={styles.metrics}>
      <article><span className={styles.purple}><Activity size={20}/></span><div><small>عمليات ناجحة · 30 يومًا</small><b>{usageTotal.toLocaleString("ar-SA")}</b><em>فشل {failedTotal.toLocaleString("ar-SA")}</em></div></article>
      <article><span className={styles.blue}><KeyRound size={20}/></span><div><small>مزودون متاحون</small><b>{activeProviders.toLocaleString("ar-SA")}</b><em>{data?.keys.length || 0} محفوظة بأمان</em></div></article>
      <article><span className={styles.green}><Users size={20}/></span><div><small>اشتراكات ومنح نشطة</small><b>{activeEntitlements.toLocaleString("ar-SA")}</b><em>غير شامل مشتركي المواد</em></div></article>
      <article><span className={styles.gold}><Coins size={20}/></span><div><small>السعر الشهري</small><b>{data?.monthlyPrice || 30} ر.س</b><em>{paidOrders ? `${paidOrders.total.toLocaleString("ar-SA")} اشتراك مدفوع · ${paidOrders.amount.toLocaleString("ar-SA")} ر.س` : "اشتراك المادة يشمله مجانًا"}</em></div></article>
    </section>

    <nav className={styles.tabs}>{([ ["overview","نظرة عامة",Gauge], ["services","الخدمات والحدود",SlidersHorizontal], ["providers","مفاتيح مزود الخدمة",KeyRound], ["subscriptions","الاشتراكات والمنح",Gift], ["orders","الاشتراكات المدفوعة",CircleDollarSign] ] as const).map(([value,label,Icon])=><button key={value} className={tab===value?styles.activeTab:""} onClick={()=>setTab(value)}><Icon size={16}/>{label}</button>)}</nav>

    {busy==="load"&&!data ? <div className={styles.loading}><LoaderCircle className={styles.spin} size={28}/><span>يجري تحميل مركز أدوات مراس…</span></div> : null}
    {!data&&busy!=="load" ? <div className={styles.empty}><CircleAlert size={27}/><p>{notice?.text || "تعذر تحميل مركز أدوات مراس."}</p><button className={styles.saveButton} onClick={()=>void load()}><RefreshCw size={16}/> إعادة المحاولة</button></div> : null}

    {data&&tab==="overview" ? <section className={styles.overview}>
      <div className={styles.healthCard}><header><div><small>حالة المنظومة</small><h2>الخدمات جاهزة ومراقبة</h2></div><span><ShieldCheck size={21}/> مفاتيح مخفية</span></header><div className={styles.healthGrid}>{data.settings.map((service)=><article key={service.service}><span className={service.enabled?styles.online:styles.offline}/><div><b>{serviceNames[service.service]}</b><small>{service.model}</small></div><em>{service.enabled?"تعمل":"متوقفة"}</em></article>)}</div><p>عند وصول مفتاح إلى حد 429 أو خطأ مؤقت، ينتقل الطلب تلقائيًا إلى مزود متاح مع فترة تهدئة للمفتاح المتعثر.</p></div>
      <div className={styles.usageCard}><header><small>استخدام آخر 30 يومًا</small><h2>التوزيع حسب الخدمة</h2></header>{data.settings.map((service)=>{const total=data.usage.filter((row)=>row.service===service.service&&row.status==="succeeded").reduce((sum,row)=>sum+row.total,0);const max=Math.max(1,...data.usage.map((row)=>row.total));return <div key={service.service}><span>{serviceNames[service.service]}</span><i><b style={{width:`${Math.max(3,total/max*100)}%`}}/></i><strong>{total}</strong></div>})}</div>
      <div className={styles.policyCard}><Bot size={25}/><h2>سياسة الاستحقاق</h2><p>يحصل مشتركو أي مادة نشطة على خطة الأدوات للمشترك تلقائيًا. ويظل بإمكان الإدارة منح اشتراك مستقل كهدية أو إحالة أو اشتراك مدفوع.</p><button onClick={()=>setTab("subscriptions")}>إدارة المنح والاشتراكات</button></div>
    </section> : null}

    {data&&tab==="services" ? <section className={styles.services}>
      <div className={styles.sectionTitle}><div><small>سيطرة مستقلة لكل أداة</small><h2>الخدمات والحدود الشهرية</h2><p>الصفر يعني أن الخدمة غير متاحة لتلك الخطة. حدود المعالجة تُحجز ذريًا لمنع تجاوزها بطلبات متزامنة.</p></div></div>
      <div className={styles.serviceGrid}>{data.settings.map((service)=><article key={service.service}>
        <header><div><span><Bot size={18}/></span><div><h3>{serviceNames[service.service]}</h3><small>{service.service}</small></div></div><label className={styles.switch}><input type="checkbox" checked={service.enabled} onChange={(event)=>updateService(service.service,{enabled:event.target.checked})}/><i/></label></header>
        <div className={styles.formGrid}><label>نموذج الخدمة<input dir="ltr" value={service.model} onChange={(event)=>updateService(service.service,{model:event.target.value})}/></label><label>الحد المجاني<input type="number" min="0" value={service.freeMonthlyLimit} onChange={(event)=>updateService(service.service,{freeMonthlyLimit:Number(event.target.value)})}/></label><label>حد المشترك<input type="number" min="0" value={service.subscriberMonthlyLimit} onChange={(event)=>updateService(service.service,{subscriberMonthlyLimit:Number(event.target.value)})}/></label><label>أقصى رموز للإجابة<input type="number" min="256" value={service.maxOutputTokens} onChange={(event)=>updateService(service.service,{maxOutputTokens:Number(event.target.value)})}/></label><label>أقصى ملف (م.ب)<input type="number" min="1" max="50" value={Math.round(service.maxFileBytes/1024/1024)} onChange={(event)=>updateService(service.service,{maxFileBytes:Number(event.target.value)*1024*1024})}/></label><label>درجة الإبداع<input type="number" min="0" max="1" step="0.05" value={service.temperature} onChange={(event)=>updateService(service.service,{temperature:Number(event.target.value)})}/></label><label className={styles.wide}>تعليمات خاصة<textarea value={service.instructions} onChange={(event)=>updateService(service.service,{instructions:event.target.value})} placeholder="تعليمات إضافية آمنة خاصة بهذه الخدمة"/></label></div>
        <button className={styles.saveButton} disabled={Boolean(busy)} onClick={()=>void mutate({action:"saveService",...service},`تم حفظ إعدادات ${serviceNames[service.service]}.`,`saveService:${service.service}`)}>{busy===`saveService:${service.service}`?<LoaderCircle className={styles.spin} size={16}/>:<Save size={16}/>} حفظ الخدمة</button>
      </article>)}</div>
    </section> : null}

    {data&&tab==="providers" ? <section className={styles.providers}>
      <div className={styles.providerForm}><div className={styles.sectionTitle}><div><small>مفتاح من مشروع مستقل عند الحاجة</small><h2>إضافة مزود الخدمة</h2><p>يُشفّر المفتاح بـ AES-256-GCM ولا يظهر مرة أخرى. تعدد المفاتيح يفيد التوفر عندما تنتمي إلى حصص أو مشاريع مختلفة.</p></div></div><div className={styles.keyFields}><label>اسم واضح<input value={keyForm.label} onChange={(event)=>setKeyForm({...keyForm,label:event.target.value})} placeholder="مزود رئيسي"/></label><label>اسم المشروع أو الحصة<input value={keyForm.projectLabel} onChange={(event)=>setKeyForm({...keyForm,projectLabel:event.target.value})} placeholder="لوحة مزود الخدمة · Project A"/></label><label>الأولوية<input type="number" min="1" value={keyForm.priority} onChange={(event)=>setKeyForm({...keyForm,priority:Number(event.target.value)})}/></label><label className={styles.keyInput}>مفتاح API<input dir="ltr" type="password" autoComplete="new-password" value={keyForm.apiKey} onChange={(event)=>setKeyForm({...keyForm,apiKey:event.target.value})} placeholder="AIza…"/></label><button disabled={Boolean(busy)} onClick={async()=>{if(await mutate({action:"addKey",...keyForm},"تم تشفير المفتاح وإضافته إلى التدوير."))setKeyForm({label:"",projectLabel:"",apiKey:"",priority:100});}}>{busy==="addKey"?<LoaderCircle className={styles.spin} size={17}/>:<Plus size={17}/>} إضافة المفتاح</button></div></div>
      <div className={styles.providerList}><header><div><small>تدوير تلقائي وفترة تهدئة</small><h2>المزودون المحفوظون</h2></div><span>{data.environmentKeyCount} مفاتيح من بيئة الخادم</span></header>{data.keys.map((key)=><article key={key.id}><div className={styles.keyIcon}><KeyRound size={19}/></div><div className={styles.keyMeta}><div><h3>{key.label}</h3><span className={key.status==="active"?styles.activeStatus:styles.disabledStatus}>{key.status==="active"?"نشط":key.status==="error"?"يحتاج مراجعة":"متوقف"}</span></div><p>{key.projectLabel||"لم يحدد المشروع"} · <span dir="ltr">{key.maskedKey}</span></p><small>آخر نجاح: {key.lastSuccessAt?new Date(key.lastSuccessAt).toLocaleString("ar-SA"):"لا يوجد"} · آخر استخدام: {key.lastUsedAt?new Date(key.lastUsedAt).toLocaleString("ar-SA"):"لم يُستخدم"}{key.consecutiveFailures?` · ${key.consecutiveFailures} إخفاقات متتالية`:""}{key.cooldownUntil?` · آخر فترة تهدئة حتى ${new Date(key.cooldownUntil).toLocaleTimeString("ar-SA")}`:""}{key.lastErrorCode?` · ${key.lastErrorCode}`:""}</small></div><label>الأولوية<input type="number" min="1" value={key.priority} onChange={(event)=>setData((current)=>current?{...current,keys:current.keys.map((item)=>item.id===key.id?{...item,priority:Number(event.target.value)}:item)}:current)}/></label><button disabled={Boolean(busy)} onClick={()=>void mutate({action:"updateKey",id:key.id,label:key.label,projectLabel:key.projectLabel,priority:key.priority,status:key.status==="active"?"disabled":"active"},key.status==="active"?"تم تعطيل المفتاح.":"تم تفعيل المفتاح وإعادته للتدوير.")}>{key.status==="active"?"تعطيل":"تفعيل"}</button></article>)}{!data.keys.length?<div className={styles.empty}><KeyRound size={27}/><p>لا توجد مفاتيح محفوظة في قاعدة البيانات. يمكن أن تعمل مفاتيح بيئة الخادم، لكنها لا تظهر هنا حفاظًا على سريتها.</p></div>:null}</div>
    </section> : null}

    {data&&tab==="subscriptions" ? <section className={styles.subscriptions}>
      <div className={styles.subscriptionControls}><div><small>السعر العام</small><h2>اشتراك أدوات مراس</h2><p>يظهر للطلاب غير المشتركين. يحصل مشترك المادة على الخطة تلقائيًا دون خصم هذا السعر.</p><label>السعر الشهري<div><input type="number" min="1" value={price} onChange={(event)=>setPrice(event.target.value)}/><span>ريال</span><button onClick={()=>void mutate({action:"setSubscription",monthlyPrice:Number(price)},"تم تحديث سعر الاشتراك.")}><Save size={15}/> حفظ</button></div></label></div><div><small>منحة مخصصة</small><h2>امنح طالبًا اشتراكًا</h2><p>يمكن استخدامها لهدية أو إحالة أو معالجة اشتراك مدفوع يدويًا.</p><div className={styles.grantForm}><input type="email" dir="ltr" placeholder="student@example.com" value={grant.email} onChange={(event)=>setGrant({...grant,email:event.target.value})}/><select value={grant.source} onChange={(event)=>setGrant({...grant,source:event.target.value})}><option value="admin">منحة إدارية</option><option value="paid">اشتراك مدفوع</option><option value="gift">هدية</option><option value="referral">إحالة</option></select><input type="number" min="1" max="36" value={grant.months} onChange={(event)=>setGrant({...grant,months:Number(event.target.value)})}/><button onClick={async()=>{if(await mutate({action:"grantEntitlement",...grant},"تم منح الاشتراك وإرسال إشعار للطالب."))setGrant({...grant,email:""});}}><Gift size={15}/> منح</button></div></div></div>
      <div className={styles.entitlementList}><header><div><small>ملكية واستحقاق واضحان</small><h2>الاشتراكات والمنح المستقلة</h2></div><span>{activeEntitlements} نشطة</span></header><div className={styles.table}><div className={styles.tableHead}><span>الطالب</span><span>المصدر</span><span>المدة</span><span>الحالة</span><span>تحكم</span></div>{data.entitlements.map((item)=><div className={styles.tableRow} key={item.id}><span><b>{item.fullName}</b><small dir="ltr">{item.email}</small></span><span>{sourceNames[item.source]||item.source}{item.createdBy?<small>بواسطة {item.createdBy}</small>:null}</span><span>{item.expiresAt?`حتى ${new Date(item.expiresAt).toLocaleDateString("ar-SA")}`:"مفتوح"}<small>من {new Date(item.startsAt).toLocaleDateString("ar-SA")}</small></span><span><i className={item.status==="active"?styles.statusDot:styles.revokedDot}/>{item.status==="active"?"نشط":"موقوف"}</span><span><button disabled={Boolean(busy)} onClick={()=>void mutate({action:"updateEntitlement",id:item.id,status:item.status==="active"?"revoked":"active"},item.status==="active"?"تم إيقاف الاستحقاق.":"تم استئناف الاستحقاق.")}>{item.status==="active"?"إيقاف":"استئناف"}</button></span></div>)}</div>{!data.entitlements.length?<div className={styles.empty}><Users size={27}/><p>لا توجد منح مستقلة بعد. اشتراكات المواد لا تحتاج سجلًا هنا لأنها تُحسب تلقائيًا.</p></div>:null}</div>
    </section> : null}

    {data&&tab==="orders" ? <section className={styles.subscriptions}>
      <div className={styles.entitlementList}><header><div><small>الإيراد الرقمي لأدوات مراس</small><h2>الاشتراكات المدفوعة عبر Tap</h2></div><span>{(data.subscriptionSummary||[]).map((row)=>`${orderStatusNames[row.status]||row.status}: ${row.total.toLocaleString("ar-SA")}`).join(" · ")||"لا توجد طلبات"}</span></header><div className={styles.table}><div className={styles.tableHead}><span>الطالب</span><span>الطلب</span><span>المبلغ</span><span>الحالة</span><span>الاستحقاق</span></div>{(data.subscriptionOrders||[]).map((order)=><div className={styles.tableRow} key={order.id}><span><b>{order.customerName}</b><small dir="ltr">{order.customerEmail}</small></span><span dir="ltr">{order.orderNumber}<small>{new Date(order.createdAt).toLocaleString("ar-SA")}</small></span><span>{order.amount.toLocaleString("ar-SA")} {order.currency}</span><span><i className={order.status==="paid"?styles.statusDot:styles.revokedDot}/>{orderStatusNames[order.status]||order.status}{order.paidAt?<small>{new Date(order.paidAt).toLocaleDateString("ar-SA")}</small>:null}</span><span>{order.entitlementExpiresAt?`حتى ${new Date(order.entitlementExpiresAt).toLocaleDateString("ar-SA")}`:"—"}</span></div>)}</div>{!(data.subscriptionOrders||[]).length?<div className={styles.empty}><CircleDollarSign size={27}/><p>لا توجد اشتراكات مدفوعة بعد. تظهر هنا محاولات الدفع والاشتراكات المكتملة مع تاريخ انتهاء الاستحقاق.</p></div>:null}</div>
    </section> : null}
  </div></main>;
}
