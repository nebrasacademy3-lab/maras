"use client";
import {AdminCapability} from "@/components/admin-capability";


import {useRouter} from "next/navigation";
import { useAdminAccess } from "@/components/admin-access";
import { CONSOLE_VIEWS } from "@/lib/staff-policy";
import { StaffManager } from "@/components/staff-manager";
import { confirmAction, promptAction } from "@/lib/interaction-events";
import { adminFetch } from "@/lib/admin-client";
import { readBrowserVideoDuration } from "@/lib/video-upload-finalize";
import { uploadResumableVideo } from "@/lib/resumable-video-client";
import { SearchableSelect } from "@/components/searchable-select";
/* eslint-disable @next/next/no-img-element -- administrator-provided institution logos use mixed official sources */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity, Bell, BookOpen, Building2, Check, ChevronLeft, CircleDollarSign, ClipboardList, CreditCard,
  FileVideo, GraduationCap, Headphones, LayoutDashboard, LoaderCircle, LockKeyhole,
  Paperclip, Plus, Receipt, RefreshCw, Search, Settings, ShieldCheck, Sparkles, Star, TicketPercent, Upload,
  UserCog, UsersRound, X,
} from "lucide-react";
import { AppearanceSettings, ThemeToggle } from "@/components/theme-provider";
import { useRealtimeSync } from "@/components/realtime-sync";
import { ADMIN_STEP_UP_MESSAGE, AdminMfaNotice, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import { automaticIdentifier } from "@/lib/public-identifiers";
import { uploadProgressLabel, type UploadProgress } from "@/lib/upload-client";
import { SupportChatThread } from "@/components/support-chat";

type Institution = { slug:string; name:string; nameEn:string; region:string; type:string; logo?:string; domain?:string; specialties:number; courses:number; featured?:boolean; status?:string; directorySourceUrl?:string; aliases?:string[]; verificationStatus?:string };
type Course = { slug:string; title:string; titleEn:string; code?:string; description:string; coverImage?:string; university:string; universitySlug:string; specialty:string; specialtySlug?:string; audienceScope?:"specialty"|"institution"; price:number; oldPrice?:number; lessons:number; access:string; accessDurationDays?:number; featured?:boolean; color:string; icon:string; status?:string; coverTheme?:string; sourceUrl?:string; verifiedAt?:string; waitlistCount?:number };
type Specialty = { slug:string; name:string; description:string; status:string; sourceUrl?:string; verifiedAt?:string; verificationStatus?:string; faculty?:string|null; degree?:string|null };
type UserSessionRow = { id:number; deviceId:string|null; deviceLabel:string; platform:string; ipAddress:string|null; lastSeenAt:string; expiresAt:string; createdAt:string };
type UserRow = { id:number; mfaEnabled?:boolean; email:string; phone:string|null; fullName:string; role:string; universitySlug:string|null; specialty:string|null; academicLevel:string|null; status:string; profileCompletedAt:string|null; onboardingCompletedAt:string|null; lastLoginAt:string|null; createdAt:string; deviceCount:number; sessions:UserSessionRow[] };
type OrderRow = { id:number; orderNumber:string; customerEmail:string; customerName:string; courseSlug:string; total:number; currency:string; status:string; createdAt:string };
type RequestRow = { id:number; userId?:number|null; courseName:string; university:string; specialty:string; status:string; name:string; phone:string; notes?:string; courseUrl?:string|null; attachmentsCount:number; preparedCourseSlug?:string|null; createdAt:string; student?:{fullName:string;email:string;phone:string|null;universitySlug:string|null;specialty:string|null;academicLevel:string|null;status:string}|null; files?:{id:number;originalName:string;contentType:string;sizeBytes:number;createdAt:string}[] };
type TicketRow = { id:number; ticketNumber:string; userEmail:string|null; category:string; priority:string; title:string; message:string; contactChannel?:string; status:string; createdAt:string; updatedAt:string; student?:{fullName:string;email:string;phone:string|null;universitySlug:string|null;specialty:string|null;academicLevel:string|null;status:string}|null; replies:Array<{id:number;body:string;authorEmail:string;authorRole:string;internal:boolean;replyToId?:number|null;createdAt:string;files?:Array<{id:number;originalName:string;contentType:string;sizeBytes:number;createdAt?:string}>}> };
type ReviewRow = { id:number; userEmail:string; courseSlug:string; rating:number; body:string; status:string; createdAt:string };
type UnitRow = { id:number; courseSlug:string; title:string; description?:string; position:number; status:string };
type LessonRow = { id:string; courseSlug:string; unitId:number; title:string; description?:string; position:number; durationSeconds:number; freePreview:boolean; status:string; videoAssetId:number|null };
type VideoRow = { id:number; courseSlug:string; lessonId:string; status:string; sizeBytes:number; createdAt:string; processingStatus?:string|null; processingProgress?:number|null; processingError?:string|null };
type AuditRow = { id:number; actorEmail:string; action:string; entityType:string; entityId:string|null; createdAt:string; beforeJson?:string|null; afterJson?:string|null; ipAddress?:string|null };
type CenterQueues = { referralsPending:number; refundPending:number; settlementUnmatched:number; reviewOrders:number; filesPendingScan:number; expiringAccess:number; pushPending:number; abandonedCheckout:number; waitlistActive:number; referralsEnabled:boolean|null };
type MfaStatus = { enabled:boolean; pendingSetup:boolean; stepUpValid:boolean };
type SupervisorAssignment = { id:number; supervisorId:number; institutionSlug:string; specialty:string; active:boolean; createdAt:string };
type AccessRow = { id:number; userEmail:string; courseSlug:string; source:string; orderNumber:string|null; startsAt:string; expiresAt:string|null; suspendedAt:string|null; suspensionReason:string|null; revokedAt:string|null; revocationReason:string|null; updatedAt:string };
type ConsoleData = {
  permissions?: string[]; isPlatformOwner?: boolean;
  pagination?: { view: string; page: number; pageSize: number; total: number } | null;
  metrics:{students:number;activeStudents:number;institutions:number;publishedCourses:number;orders:number;paidOrders:number;revenue:number;reviewOrders?:number;openRequests:number;openTickets:number;pendingReviews:number};
  services:{assistant:boolean;merasAi?:boolean;payments:boolean;email:boolean;videoSigning:boolean;mfaConfigured?:boolean}; institutions:Institution[]; courses:Course[]; specialties:Specialty[];
  specialtyLinks:Array<{id:number;institutionSlug:string;specialtySlug:string;status:string}>; users:UserRow[]; orders:OrderRow[]; requests:RequestRow[];
  tickets:TicketRow[]; reviews:ReviewRow[]; units:UnitRow[]; lessons:LessonRow[]; videos:VideoRow[];
  notifications:Array<{id:number;title:string;body:string;audience:string;userEmail:string|null;actionUrl?:string|null;actionLabel?:string|null;presentation?:string;template?:string;pushEnabled?:boolean;startsAt?:string|null;expiresAt?:string|null;createdAt:string}>;
  access:AccessRow[];
  supervisorAssignments:SupervisorAssignment[];
  coupons:Array<{id:number;code:string;type:string;value:number;courseSlug:string|null;usedCount:number;usageLimit:number|null;status:string}>;
  settings:Record<string,string>; deviceLimit:number; audit:AuditRow[]; generatedAt:string;
};

type View = "overview"|"institutions"|"specialties"|"courses"|"content"|"students"|"subscriptions"|"orders"|"requests"|"support"|"reviews"|"notifications"|"coupons"|"staff"|"audit"|"settings";
type Dialog = { kind:"institution"; item?:Institution }|{ kind:"specialty"; item?:Specialty }|{ kind:"course"; item?:Course }|{ kind:"staff"; item?:UserRow }|{ kind:"access"; user:UserRow }|null;
type DeleteRequest = { entityType:string; entityId:string; label:string; impact:string };

const menuGroups = [
  { label:"التشغيل", items:[{id:"overview",label:"نظرة عامة",icon:LayoutDashboard},{id:"orders",label:"الطلبات والمدفوعات",icon:Receipt},{id:"requests",label:"طلبات المواد",icon:ClipboardList},{id:"support",label:"الدعم",icon:Headphones}] },
  { label:"الكتالوج", items:[{id:"institutions",label:"الجامعات والشعارات",icon:Building2},{id:"specialties",label:"التخصصات والربط",icon:GraduationCap},{id:"courses",label:"المواد والأسعار",icon:BookOpen},{id:"content",label:"الوحدات والدروس والفيديو",icon:FileVideo}] },
  { label:"المستخدمون", items:[{id:"students",label:"الطلاب",icon:UsersRound},{id:"subscriptions",label:"الاشتراكات والوصول",icon:ShieldCheck},{id:"staff",label:"المشرفون والإدارة",icon:UserCog},{id:"reviews",label:"التقييمات",icon:Star},{id:"notifications",label:"الإشعارات",icon:Bell}] },
  { label:"النظام", items:[{id:"coupons",label:"الكوبونات",icon:TicketPercent},{id:"settings",label:"التواصل والإعدادات",icon:Settings},{id:"audit",label:"سجل النشاط",icon:Activity}] },
] as const;

const titles:Record<View,string> = Object.fromEntries(menuGroups.flatMap((group)=>group.items.map((item)=>[item.id,item.label]))) as Record<View,string>;
const statusLabel=(value:string)=>({published:"منشور",hidden:"مخفي",draft:"مسودة",active:"نشط",disabled:"متوقف",suspended:"موقوف",paid:"مدفوع",pending:"معلّق",initiated:"بدأ الدفع",verification_pending:"قيد التحقق من الدفع",payment_review:"قيد مراجعة الدفع",failed:"فشل",refunded:"مسترد",partially_refunded:"مسترد جزئيًا",cancelled:"ملغي",voided:"ملغى من بوابة الدفع",new:"جديد",assigned:"مسند",reviewing:"مراجعة",planned:"مخطط",producing:"إنتاج",available:"متاح",declined:"متعذر",open:"مفتوح",waiting:"بانتظار الطالب",resolved:"محلول",closed:"مغلقة",rejected:"مرفوض"} as Record<string,string>)[value]||"حالة غير معروفة";
const auditActionLabel=(value:string)=>({create:"إنشاء",update:"تحديث",delete:"حذف",grant:"منح",pause:"إيقاف مؤقت",resume:"استئناف",extend:"تمديد",revoke:"إلغاء",prepare:"تجهيز",moderate:"مراجعة",save:"حفظ",sync:"مزامنة",reconcile:"مطابقة",review:"مراجعة",activate:"تفعيل",dispatch:"إرسال",approve:"اعتماد",reject:"رفض",import:"استيراد",resolve:"حسم",publish:"نشر",archive:"أرشفة",rotate:"تدوير",disable:"تعطيل",enable:"تمكين",refund:"استرداد",export:"تصدير",login:"دخول",setup:"إعداد",verify:"تحقق"} as Record<string,string>)[value]||"إجراء إداري";
const auditEntityLabel=(value:string)=>({user:"حساب",course:"مادة",lesson:"درس",unit:"وحدة",video:"فيديو",notification:"إشعار",course_access:"اشتراك",course_request:"طلب مادة",support_ticket:"تذكرة دعم",review:"تقييم",coupon:"كوبون",platform_settings:"إعدادات المنصة",supervisor_assignment:"نطاق مشرف",auth_session:"جلسة جهاز",institution:"جهة تعليمية",specialty:"تخصص",referral_tier:"مستوى إحالة",referral_settings:"إعدادات الإحالات",referral_attribution:"إحالة",referral_rewards:"مكافآت الإحالات",user_reward:"هدية مستخدم",ai_service_setting:"خدمة أدوات",ai_api_key:"مفتاح تشغيل",ai_entitlement:"اشتراك أدوات",ai_subscription:"اشتراك أدوات",course_bundle:"باقة",learning_track:"مسار تعليمي",refund_request:"طلب استرداد",payment_settlement:"تسوية دفع",order:"طلب",notification_campaigns:"حملات الإشعارات",catalog_templates:"قوالب الكتالوج",official_programs:"البرامج الرسمية",compliance_control:"ضابط امتثال",admin_mfa:"المصادقة الإضافية",lifecycle:"الأتمتة",video_asset:"ملف فيديو"} as Record<string,string>)[value]||"سجل إداري";
const notificationAudienceLabel=(value?:string)=>({student:"جميع الطلاب",public:"الزوار والطلاب",supervisor:"المشرفون",admin:"الإدارة",user:"مستخدم محدد"} as Record<string,string>)[value||"student"]||"جمهور مخصص";
const notificationPresentationLabel=(value?:string)=>({inbox:"مركز الإشعارات",banner:"شريط إعلاني",modal:"نافذة منبثقة",all:"مركز الإشعارات والشريط والنافذة"} as Record<string,string>)[value||"inbox"]||"عرض مخصص";
const notificationTemplateLabel=(value?:string)=>({general:"إعلان عام",discount:"تخفيض","new-course":"مادة جديدة","new-service":"خدمة جديدة",urgent:"تنبيه مهم",success:"خبر سار"} as Record<string,string>)[value||"general"]||"إعلان مخصص";

const VIEW_IDS=new Set<string>(menuGroups.flatMap((group)=>group.items.map((item)=>item.id)));
export function isAdminView(value:unknown):value is View{return typeof value==="string"&&VIEW_IDS.has(value);}

export function AdminDashboard({ adminName, initialView, initialQuery }: { adminName:string; initialView?:string; initialQuery?:string }) {
  const { can, owner } = useAdminAccess();
  const router=useRouter();
  const [active]=useState<View>(isAdminView(initialView) && can(CONSOLE_VIEWS[initialView]) ? initialView : "overview"); const [query,setQuery]=useState(initialQuery||"");
  const [pageState,setPageState]=useState({view: initialView || "overview",query: initialQuery || "",page:1});
  const page=pageState.view===active&&pageState.query===query?pageState.page:1;
  const requestSequence=useRef(0);
  const readController=useRef<AbortController|null>(null),centersController=useRef<AbortController|null>(null),alive=useRef(true),mutating=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;readController.current?.abort();centersController.current?.abort();};},[]);
  const [data,setData]=useState<ConsoleData|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [toast,setToast]=useState(""); const [dialog,setDialog]=useState<Dialog>(null); const [deleteRequest,setDeleteRequest]=useState<DeleteRequest|null>(null);
  const [queues,setQueues]=useState<CenterQueues|null>(null); const [mfa,setMfa]=useState<MfaStatus|null>(null); const [mfaNotice,setMfaNotice]=useState(false); const [mfaDismissed,setMfaDismissed]=useState(false);
  const loadCenters=useCallback(async()=>{
    centersController.current?.abort();const controller=new AbortController();centersController.current=controller;const signal=controller.signal;
    const [summary,referrals,security]=await Promise.all([
      can(["operations.manage", "data.all"]) ? adminFetch("/api/admin/operations/summary",{credentials:"same-origin",signal}).then((response)=>response.ok?response.json():null).catch(()=>null) as Promise<{queues?:Record<string,number>;waitlist?:Record<string,number>}|null> : Promise.resolve(null),
      can(["referrals.manage", "data.all"]) ? adminFetch("/api/admin/referrals?scope=stats",{credentials:"same-origin",signal}).then((response)=>response.ok?response.json():null).catch(()=>null) as Promise<{stats?:{pending:number};settings?:{enabled:boolean}}|null> : Promise.resolve(null),
      adminFetch("/api/admin/security/mfa",{credentials:"same-origin",signal}).then((response)=>response.ok?response.json():null).catch(()=>null) as Promise<MfaStatus|null>,
    ]);
    if(signal.aborted||!alive.current||centersController.current!==controller)return;
    setQueues({referralsPending:referrals?.stats?.pending||0,referralsEnabled:referrals?.settings?.enabled??null,refundPending:summary?.queues?.refundPending||0,settlementUnmatched:summary?.queues?.settlementUnmatched||0,reviewOrders:0,filesPendingScan:summary?.queues?.filesPendingScan||0,expiringAccess:summary?.queues?.expiringAccess||0,pushPending:summary?.queues?.pushPending||0,abandonedCheckout:summary?.queues?.abandonedCheckout||0,waitlistActive:summary?.waitlist?.active||0});
    if(security)setMfa({enabled:Boolean(security.enabled),pendingSetup:Boolean(security.pendingSetup),stepUpValid:Boolean(security.stepUpValid)});
  },[can]);
  const load=useCallback(async()=>{if(!alive.current)return;readController.current?.abort();const controller=new AbortController();readController.current=controller;const sequence=++requestSequence.current;setLoading(true);setError("");try{const response=await adminFetch(`/api/admin/console?${new URLSearchParams({scope:"screen",view:active,q:query,page:String(page)})}`,{credentials:"same-origin",signal:controller.signal});const result=await response.json() as ConsoleData&{error?:string};if(!response.ok)throw new Error(result.error||"تعذر تحميل لوحة الإدارة");if(sequence===requestSequence.current&&!controller.signal.aborted&&alive.current){setData(result);void loadCenters();}}catch(caught){const message=caught instanceof Error?caught.message:"تعذر التحميل";if(sequence!==requestSequence.current||controller.signal.aborted||!alive.current)return;setError(message);setToast(`تعذر تحديث البيانات: ${message}`);setTimeout(()=>setToast(""),4200);}finally{if(sequence===requestSequence.current&&!controller.signal.aborted&&alive.current)setLoading(false);}},[loadCenters,active,query,page]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),250);return()=>{window.clearTimeout(timer);readController.current?.abort();centersController.current?.abort();};},[load]);
  const reloadTimer=useRef<number|null>(null); const lastReload=useRef(0);
  const scheduleReload=useCallback(()=>{const wait=Math.max(0,5000-(Date.now()-lastReload.current));if(reloadTimer.current!==null)return;reloadTimer.current=window.setTimeout(()=>{reloadTimer.current=null;lastReload.current=Date.now();void load();},wait);},[load]);
  useEffect(()=>()=>{requestSequence.current++;if(reloadTimer.current!==null)window.clearTimeout(reloadTimer.current);},[]);
  useRealtimeSync((payload) => {
    if (!payload.changed || payload.changed.some((channel) => channel === "admin" || channel === "catalog" || channel === "settings" || channel === "announcements")) scheduleReload();
  });
  const mutate=async(payload:Record<string,unknown>,success="تم حفظ التغييرات"):Promise<boolean>=>{if(!alive.current||mutating.current)return false;mutating.current=true;try{const response=await adminFetch("/api/admin/console",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const result=await response.json() as {error?:string;code?:string;push?:{scheduled?:boolean;campaigns?:number;attempted:number;accepted:number;rejected:number;invalidated:number;providerErrors:string[]}};if(!alive.current)return false;if(isAdminStepUpResponse(response)){setMfaNotice(true);throw new Error(ADMIN_STEP_UP_MESSAGE);}if(!response.ok)throw new Error(result.error||"تعذر الحفظ");const pushCopy=result.push?(result.push.scheduled?" جرى جدولة الإشعار الفوري لوقت البدء، وسيبقى الإعلان مخفيًا حتى ذلك الوقت.":result.push.attempted===0?(result.push.campaigns?` فُحصت ${result.push.campaigns.toLocaleString("ar-SA")} حملة مستحقة، ولا توجد أجهزة نشطة.`:" حُفظ في الصندوق، ولا توجد أجهزة مسجلة للإشعارات الفورية حاليًا."):` قُبل الإشعار على ${result.push.accepted.toLocaleString("ar-SA")} من ${result.push.attempted.toLocaleString("ar-SA")} جهاز${result.push.rejected?`، وتعذر ${result.push.rejected.toLocaleString("ar-SA")}`:""}.`):"";setToast(`${success}${pushCopy}`);setTimeout(()=>setToast(""),pushCopy?5200:2800);await load();return true;}catch(caught){if(!alive.current)return false;const message=caught instanceof Error?caught.message:"تعذر تنفيذ العملية";setToast(`تعذر التنفيذ: ${message}`);setTimeout(()=>setToast(""),4200);await load();return false;}finally{mutating.current=false;}};
  const openAdd=()=>{if(active==="institutions")setDialog({kind:"institution"});else if(active==="specialties")setDialog({kind:"specialty"});else if(active==="courses")setDialog({kind:"course"});else if(active==="staff")setDialog({kind:"staff"});};
  const requestDelete=(entityType:string,entityId:string|number,label:string,impact:string)=>setDeleteRequest({entityType,entityId:String(entityId),label,impact});
  const canAdd=can(["catalog.manage"]) && (["institutions","specialties"].includes(active) ? can(["data.all"]) : active === "courses");
  const render=()=>{if(!data)return null;if(["institutions","specialties","courses","content"].includes(active)&&(!can(["catalog.manage"]) || ["institutions","specialties"].includes(active) && !can(["data.all"])))return <ReadOnlyCatalog data={data} view={active} query={query}/>;const props={data,query,mutate,setDialog,onDelete:requestDelete};switch(active){case"overview":return <Overview data={data} go={(view)=>router.push(`/admin?view=${view}`)} queues={queues} mfa={mfa}/>;case"institutions":return <Institutions {...props}/>;case"specialties":return <Specialties {...props}/>;case"courses":return <Courses {...props}/>;case"content":return <Content data={data} mutate={mutate} refresh={load} onDelete={requestDelete}/>;case"students":return <Users data={data} query={query} mutate={mutate} setDialog={setDialog} role="student" onDelete={requestDelete}/>;case"subscriptions":return <Subscriptions data={data} query={query} mutate={mutate}/>;case"staff":return <StaffManager/>;case"orders":return <Orders data={data} query={query}/>;case"requests":return <Requests data={data} query={query} mutate={mutate} onDelete={requestDelete}/>;case"support":return <Support data={data} query={query} mutate={mutate} refresh={load} onDelete={requestDelete}/>;case"reviews":return <Reviews data={data} query={query} mutate={mutate} onDelete={requestDelete}/>;case"notifications":return <Notifications data={data} mutate={mutate} onDelete={requestDelete}/>;case"coupons":return <Coupons data={data} mutate={mutate} onDelete={requestDelete}/>;case"settings":return <PlatformSettings data={data} mutate={mutate}/>;case"audit":return <Audit data={data} query={query}/>;}};
  return <main className="admin-app"><section className="admin-main"><header className="admin-header"><div><label><Search size={17}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="ابحث في القسم الحالي..."/></label></div><div><ThemeToggle compact/><button className="icon-button" onClick={()=>void load()} aria-label="تحديث"><RefreshCw size={18}/></button><span className="admin-divider"/><span className="admin-user"><span>{adminName[0]}</span><div><strong>{adminName}</strong><small>{owner ? "المدير الأعلى" : "مشرف بصلاحيات محددة"}</small></div></span></div></header><div className="admin-content"><div className="admin-page-title"><div><p>لوحة الإدارة <ChevronLeft size={12}/> {titles[active]}</p><h1>{titles[active]}</h1></div>{canAdd&&<button className="button button-primary" onClick={openAdd}><Plus size={16}/> إضافة جديد</button>}</div>{mfaNotice&&<AdminMfaNotice/>}{!mfaNotice&&!mfaDismissed&&data&&(data.services.mfaConfigured===false||(mfa&&!mfa.enabled))&&<div className="admin-mfa-banner" role="status"><LockKeyhole size={17}/><p>{data.services.mfaConfigured===false?"مفتاح ADMIN_MFA_ENCRYPTION_KEY غير مضبوط على الخادم؛ لن تعمل العمليات الحساسة (الحذف النهائي، الإحالات، أدوات مراس، المالية) حتى ضبطه ثم تفعيل المصادقة الإضافية.":"فعّل المصادقة الإضافية (MFA) لتنفيذ العمليات الحساسة مثل الحذف النهائي وإدارة الإحالات وأدوات مراس والمالية."}</p><Link href="/admin/security">فتح أمان الحساب</Link><button type="button" onClick={()=>setMfaDismissed(true)} aria-label="إخفاء التنبيه"><X size={15}/></button></div>}{loading&&!data?<Loading/>:error&&!data?<ErrorState text={error} retry={load}/>:render()}{data?.pagination&&data.pagination.view===active&&<nav className="live-actions" aria-label="صفحات القسم"><button disabled={loading||page<=1} onClick={()=>setPageState({view:active,query,page:page-1})}>السابق</button><span>صفحة {page} من {Math.max(1,Math.ceil(data.pagination.total/data.pagination.pageSize))} · {data.pagination.total.toLocaleString("ar-SA")} سجل مطابق</span><button disabled={loading||page*data.pagination.pageSize>=data.pagination.total} onClick={()=>setPageState({view:active,query,page:page+1})}>التالي</button></nav>}</div></section>{dialog&&data&&<AdminDialog dialog={dialog} data={data} close={()=>setDialog(null)} mutate={mutate} refresh={load}/>} {deleteRequest&&<AdminConfirmDialog request={deleteRequest} close={()=>setDeleteRequest(null)} mutate={mutate}/>} {toast&&<div className="admin-toast"><Sparkles size={16}/>{toast}</div>}</main>;
}

function ReadOnlyCatalog({data,view,query}:{data:ConsoleData;view:string;query:string}) {
 const rows=view==="institutions"?data.institutions.map(r=>({id:r.slug,title:r.name,detail:r.region})):view==="specialties"?data.specialties.map(r=>({id:r.slug,title:r.name,detail:r.description})):view==="courses"?data.courses.map(r=>({id:r.slug,title:r.title,detail:`${r.university} · ${r.specialty}`})):data.lessons.map(r=>({id:r.id,title:r.title,detail:r.courseSlug}));
 const shown=rows.filter(row=>`${row.title} ${row.detail}`.toLocaleLowerCase("ar").includes(query.toLocaleLowerCase("ar")));
 return <section className="admin-panel"><p className="live-hint">عرض المحتوى فقط؛ لا تظهر أدوات التعديل والنشر والحذف دون صلاحياتها.</p><div className="live-units">{shown.map(row=><article key={row.id}><h2 style={{fontSize:19}}>{row.title}</h2><p>{row.detail}</p><small dir="ltr">{row.id}</small></article>)}</div>{!shown.length&&<p>لا توجد نتائج مطابقة.</p>}</section>;
}

function Loading(){return <section className="admin-panel live-loading"><LoaderCircle className="spin"/><h2>جارٍ تحميل بيانات التشغيل</h2></section>}
function ErrorState({text,retry}:{text:string;retry:()=>Promise<void>}){return <section className="admin-panel live-loading"><ShieldCheck/><h2>{text}</h2><button className="button button-primary" onClick={()=>void retry()}>إعادة المحاولة</button></section>}
function Metric({icon:Icon,label,value,copy,color}:{icon:React.ElementType;label:string;value:string;copy:string;color:string}){return <article className="admin-metric"><i className={color}><Icon size={20}/></i><span><small>{label}</small><strong>{value}</strong><em>{copy}</em></span></article>}

function Overview({data,go,queues,mfa}:{data:ConsoleData;go:(view:View)=>void;queues:CenterQueues|null;mfa:MfaStatus|null}) {
  const {can}=useAdminAccess();
  const tasks=[{label:"طلبات مواد مفتوحة",value:data.metrics.openRequests,view:"requests" as View},{label:"تذاكر دعم مفتوحة",value:data.metrics.openTickets,view:"support" as View},{label:"تقييمات تحتاج مراجعة",value:data.metrics.pendingReviews,view:"reviews" as View},{label:"مدفوعات تحتاج تحققًا",value:data.metrics.reviewOrders||0,view:"orders" as View}].filter(task=>can(CONSOLE_VIEWS[task.view]));
  return <><div className="admin-metrics">
    {can(["finance.view"])&&<Metric icon={CircleDollarSign} label="الإيراد المؤكد" value={`${data.metrics.revenue.toLocaleString("ar-SA")} ر.س`} copy={`${data.metrics.paidOrders} طلب مدفوع`} color="blue"/>}
    {can(["students.view"])&&<Metric icon={UsersRound} label="الطلاب" value={data.metrics.students.toLocaleString("ar-SA")} copy={`${data.metrics.activeStudents} حساب نشط`} color="violet"/>}
    {can(["catalog.view"])&&<><Metric icon={Building2} label="الجهات التعليمية" value={String(data.metrics.institutions)} copy="الجامعات والكليات" color="green"/><Metric icon={BookOpen} label="المواد المنشورة" value={String(data.metrics.publishedCourses)} copy="المحتوى المتاح للمراجعة" color="orange"/></>}
  </div><div className="admin-dashboard-grid"><section className="admin-panel live-queue"><div className="admin-panel-head"><div><h2>ما يحتاج متابعتك</h2><p>تظهر الأعمال التي تملك صلاحيتها فقط؛ الأقسام في قائمة واحدة.</p></div></div>{tasks.length?tasks.map(task=><button key={task.view} onClick={()=>go(task.view)}><span>{task.label}</span><strong>{task.value}</strong><ChevronLeft size={16}/></button>):<p className="empty-copy">لا توجد مهام متابعة ممنوحة لحسابك حاليًا. استخدم «حسابي وأماني» لحماية حسابك.</p>}</section>
  <section className="admin-panel"><div className="admin-panel-head"><div><h2>أمان حسابك</h2><p>حالة التحقق تخص حسابك، ولا تمنحك صلاحيات إضافية.</p></div></div><p>{mfa?.enabled?"المصادقة الإضافية مفعلة؛ العمليات الحساسة تطلب إثباتًا حديثًا.":"أكمل إعداد المصادقة الإضافية لحماية الإجراءات الحساسة."}</p><Link className="button button-soft" href="/admin/security">إدارة أمان حسابي <ShieldCheck size={17}/></Link></section></div>
  {can(["operations.manage", "data.all"])&&<section className="admin-panel"><div className="admin-panel-head"><div><h2>ملخص التشغيل</h2><p>المتابعة التفصيلية في التشغيل والإعدادات.</p></div><Link href="/admin/operations">فتح التشغيل <ChevronLeft size={15}/></Link></div><p>{queues?`${queues.filesPendingScan} ملفات بانتظار الفحص · ${queues.pushPending} إشعارات معلقة`:"تُحدّث حالة الخدمات عند الاتصال."}</p></section>}
  {can(["finance.view"])&&<section className="admin-panel live-recent"><div className="admin-panel-head"><div><h2>آخر الطلبات</h2><p>سجل الطلبات المالية المسموح لك عرضه</p></div><button onClick={()=>go("orders")}>عرض الكل <ChevronLeft size={14}/></button></div><Table headers={["الطلب","الطالب","المادة","المبلغ","الحالة"]}>{data.orders.slice(0,8).map(row=><div className="live-table-row" key={row.orderNumber}><b dir="ltr">{row.orderNumber}</b><span>{row.customerName}<small>{row.customerEmail}</small></span><span>{data.courses.find(course=>course.slug===row.courseSlug)?.title||row.courseSlug}</span><strong>{row.total} {row.currency}</strong><em className={`status ${row.status==="paid"?"published":"draft"}`}>{statusLabel(row.status)}</em></div>)}</Table></section>}</>;
}

function Table({headers,children}:{headers:string[];children:React.ReactNode}){return <div className="live-table" role="region" tabIndex={0} aria-label={`جدول ${headers.join("، ")}`} style={{"--live-columns":headers.length} as React.CSSProperties}><div className="live-table-row live-table-head">{headers.map((header)=><span key={header}>{header}</span>)}</div>{children}</div>}
function includesQuery(query:string,...values:Array<string|number|null|undefined>){const needle=query.trim().toLowerCase();return !needle||values.join(" ").toLowerCase().includes(needle)}
function institutionPayload(row: ConsoleData["institutions"][number], status: string, featured: boolean) { return { action: "saveInstitution", slug: row.slug, name: row.name, nameEn: row.nameEn, region: row.region, type: row.type, domain: row.domain || "", directorySourceUrl: row.directorySourceUrl || "", verificationStatus: row.verificationStatus || "official-directory", aliases: row.aliases || [], logoUrl: row.logo || "", status, featured }; }

function Institutions({data,query,mutate,setDialog,onDelete}:{data:ConsoleData;query:string;mutate:(p:Record<string,unknown>,s?:string)=>Promise<boolean>;setDialog:(d:Dialog)=>void;onDelete:(entityType:string,entityId:string|number,label:string,impact:string)=>void}){const rows=data.institutions.filter((row)=>includesQuery(query,row.name,row.nameEn,row.region,row.type));return <section className="admin-panel data-panel"><div className="live-panel-note"><ShieldCheck size={17}/><p>يمكن رفع PNG/JPG/WebP إلى التخزين الدائم أو استخدام رابط HTTPS رسمي. يعالج إطار الشعار الوضعين الفاتح والداكن.</p></div><Table headers={["الجهة","النوع","المنطقة","التخصصات","المواد","إجراءات"]}>{rows.map((row)=><div className="live-table-row" key={row.slug}><span className="live-entity"><i>{row.logo?<img src={row.logo} alt=""/>:row.name[0]}</i><b>{row.name}<small>{row.nameEn}{row.featured?" · مميزة":""}</small></b></span><span>{row.type}</span><span>{row.region}</span><span>{row.specialties}</span><span>{row.courses}</span><span className="live-actions"><button onClick={()=>setDialog({kind:"institution",item:row})}>تعديل</button><button onClick={()=>void mutate(institutionPayload(row,row.status==="hidden"?"published":"hidden",Boolean(row.featured)),row.status==="hidden"?"تم نشر الجهة":"تم إخفاء الجهة")}>{row.status==="hidden"?"نشر":"إخفاء"}</button><AdminCapability all={["records.delete"]}><button className="danger-button" onClick={()=>onDelete("institution",row.slug,row.name,"سيُحذف الشعار والمواد والوحدات والدروس التابعة. سيُمنع الحذف إذا وُجد طلاب أو نشاط مالي مرتبط.")}>حذف نهائي</button></AdminCapability></span></div>)}</Table></section>}

function Specialties({data,query,mutate,setDialog,onDelete}:{data:ConsoleData;query:string;mutate:(p:Record<string,unknown>,s?:string)=>Promise<boolean>;setDialog:(d:Dialog)=>void;onDelete:(entityType:string,entityId:string|number,label:string,impact:string)=>void}){
  const [institutionSlug,setInstitutionSlug]=useState(data.institutions[0]?.slug||"");
  const rows=data.specialties.filter((row)=>includesQuery(query,row.name,row.slug,row.verificationStatus,row.degree));
  const institution=data.institutions.find((row)=>row.slug===institutionSlug);
  const syncOfficial=()=>void mutate({action:"syncOfficialPrograms",institutionSlug},`تم التحقق من برامج ${institution?.name||"الجامعة"} وربط البرامج الرسمية المتاحة`);
  return <>
    <section className="admin-panel catalog-sync-panel official-program-sync">
      <div><h2>التحقق من برامج جامعة</h2><p>يجلب البرامج المنشورة من منصة «ادرس في السعودية»، يزيل تكرار فئات المتقدمين، ويسجل رابط المصدر وتاريخ التحقق من دون حذف التعديلات اليدوية.</p></div>
      <div className="official-program-controls">
<SearchableSelect value={institutionSlug} onChange={(event)=>setInstitutionSlug(event.target.value)}>{data.institutions.map((row)=><option key={row.slug} value={row.slug}>{row.name}</option>)}</SearchableSelect>
<button type="button" className="button button-primary" disabled={!institutionSlug} onClick={syncOfficial}><RefreshCw size={15}/> تحقق واربط البرامج</button></div>
    </section>
    <section className="admin-panel data-panel">
      <div className="live-panel-note"><GraduationCap size={17}/><p>«موثّق رسميًا» يعني أن الاسم والدرجة ظهرا في مصدر حكومي أو رسمي. عناصر «للاكتشاف» تبقى قابلة للإدارة ولا تُعرض كحقائق موثقة.</p></div>
      <Table headers={["التخصص","الدرجة والمصدر","الجهات المرتبطة","الحالة","الوصف","إجراء"]}>{rows.map((row)=><div className="live-table-row" key={row.slug}><strong>{row.name}<small dir="ltr">{row.slug}</small></strong><span><b>{row.degree||"غير محدد"}</b><small>{row.verificationStatus==="official-program"?"موثّق رسميًا":row.verificationStatus==="discovery"?"للاكتشاف":"بانتظار المراجعة"}{row.verifiedAt?` · ${row.verifiedAt}`:""}</small>{row.sourceUrl&&<a href={row.sourceUrl} target="_blank" rel="noreferrer">فتح المصدر</a>}</span><span>{data.specialtyLinks.filter((link)=>link.specialtySlug===row.slug&&link.status==="published").length}</span><em className={`status ${row.status==="published"?"published":"draft"}`}>{statusLabel(row.status)}</em><span>{row.description||"—"}</span><span className="live-actions"><button onClick={()=>setDialog({kind:"specialty",item:row})}>تعديل</button><AdminCapability all={["records.delete"]}><button className="danger-button" onClick={()=>onDelete("specialty",row.slug,row.name,"سيُحذف الربط والمواد التابعة ومحتواها، ويُمنع إذا كان مرتبطًا بطلاب أو سجل مالي.")}>حذف نهائي</button></AdminCapability></span></div>)}</Table>
    </section>
  </>
}

function Courses({data,query,setDialog,onDelete}:{data:ConsoleData;query:string;mutate:(p:Record<string,unknown>,s?:string)=>Promise<boolean>;setDialog:(d:Dialog)=>void;onDelete:(entityType:string,entityId:string|number,label:string,impact:string)=>void}){const rows=data.courses.filter((row)=>includesQuery(query,row.title,row.university,row.specialty,row.code));return <section className="admin-panel data-panel"><Table headers={["المادة","الجامعة والتخصص","السعر","الدروس","الطلب والوصول","إجراء"]}>{rows.map((row)=><div className="live-table-row" key={row.slug}><span className="live-entity"><i className={`bg-gradient-to-br ${row.color}`}>{row.coverImage?<img src={row.coverImage} alt="" loading="lazy"/>:row.icon}</i><b>{row.title}<small>{row.code||row.slug}</small></b></span><span>{row.university}<small>{row.specialty}</small></span><strong>{row.price} ر.س</strong><span>{row.lessons}<small>{statusLabel(row.status||"published")}</small></span><span>{row.access}<small>{row.waitlistCount?`${row.waitlistCount} في قائمة الانتظار`:"لا يوجد انتظار"}</small></span><span className="live-actions"><AdminCapability all={["students.view","catalog.view"]}><Link href={`/admin/courses/${encodeURIComponent(row.slug)}`}>المشتركون والمنتظرون</Link></AdminCapability><button onClick={()=>setDialog({kind:"course",item:row})}>تعديل المادة</button><AdminCapability all={["records.delete"]}><button className="danger-button" onClick={()=>onDelete("course",row.slug,row.title,"سيُحذف الوحدات والدروس والفيديوهات والملفات والتقدم والمفضلة والسلة. لن يُحذف إذا وُجد طلب مدفوع أو فاتورة أو وصول فعال.")}>حذف نهائي</button></AdminCapability></span></div>)}</Table></section>}

const videoStateLabel=(video?:VideoRow)=>{if(!video)return "بانتظار الفيديو";const state=video.processingStatus||"ready";if(state==="processing")return `تجري المعالجة ${Math.max(1,Math.min(100,Number(video.processingProgress||0)))}%`;if(state==="queued"||state==="pending")return "في طابور المعالجة";if(state==="retrying")return "ستُعاد المعالجة تلقائيًا";if(state==="failed")return "تعذرت المعالجة — الأصل متاح";return video.status==="ready"?"الفيديو جاهز":"بانتظار الفيديو";};

function Content({data,mutate,refresh,onDelete}:{data:ConsoleData;mutate:(p:Record<string,unknown>,s?:string)=>Promise<boolean>;refresh:()=>Promise<void>;onDelete:(entityType:string,entityId:string|number,label:string,impact:string)=>void}){const managedSlugs=new Set(data.units.map((row)=>row.courseSlug));const[firstCourse]=data.courses;const[selected,setSelected]=useState(firstCourse?.slug||"");const units=data.units.filter((row)=>row.courseSlug===selected);const lessons=data.lessons.filter((row)=>row.courseSlug===selected);const[retryMessage,setRetryMessage]=useState("");const retryVideo=async(assetId:number)=>{setRetryMessage("");try{const response=await adminFetch("/api/admin/videos/process",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({assetId})});const result=await response.json() as {error?:string;processing?:{message?:string;available?:boolean}};if(!response.ok)throw new Error(result.error||"تعذر إعادة المعالجة");setRetryMessage(result.processing?.available===false?(result.processing.message||"FFmpeg غير متاح؛ سيبقى الفيديو الأصلي متاحًا."):"أُعيد الفيديو إلى طابور المعالجة وسيتحدث الحالة تلقائيًا.");await refresh();}catch(caught){setRetryMessage(caught instanceof Error?caught.message:"تعذر إعادة المعالجة");}};const submitUnit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const ok=await mutate({action:"saveUnit",courseSlug:selected,title:form.get("title"),description:form.get("description"),position:units.length,status:"published"},"تمت إضافة الوحدة");if(ok)event.currentTarget.reset();};const submitLesson=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const ok=await mutate({action:"saveLesson",intent:"create",id:form.get("id"),courseSlug:selected,unitId:Number(form.get("unitId")),title:form.get("title"),description:form.get("description"),durationSeconds:0,freePreview:form.get("freePreview")==="on",position:lessons.length,status:"published"},"تمت إضافة الدرس");if(ok)event.currentTarget.reset();};return <><section className="admin-panel catalog-sync-panel"><div><h2>تجهيز الكتالوج الأساسي السريع</h2><p>يثبّت جميع الجهات والتخصصات، ويحوّل مواد الرئيسية إلى مواد إدارية كاملة بوحداتها ودروسها الجاهزة لرفع الفيديو، دون استبدال تعديلاتك اليدوية.</p></div><button type="button" className="button button-primary" onClick={() => void mutate({action:"syncCatalogTemplates",mode:"core",templatePrice:49},"تم تجهيز الجامعات والتخصصات ومواد الرئيسية والوحدات والدروس")}>تجهيز الكتالوج الآن</button></section><div className="live-content-grid"><section className="admin-panel"><div className="admin-panel-head"><div><h2>المادة</h2><p>اختر مادة أُنشئت أو حُوّلت إلى إدارة الكتالوج</p></div></div>
<SearchableSelect className="live-wide-select" value={selected} onChange={(event)=>setSelected(event.target.value)}>{data.courses.map((course)=><option value={course.slug} key={course.slug}>{course.title} — {course.university}</option>)}</SearchableSelect>
{!managedSlugs.has(selected)&&<p className="live-hint">أضف المادة/احفظها من قسم المواد أولًا، ثم أنشئ وحدتها الأولى هنا.</p>}{retryMessage&&<p className="live-hint">{retryMessage}</p>}<form className="live-inline-form" onSubmit={submitUnit}><input name="title" required placeholder="اسم وحدة جديدة"/><input name="description" placeholder="وصف الوحدة (اختياري)"/><button className="button button-primary"><Plus size={15}/> إضافة وحدة</button></form><div className="live-units">{units.map((unit)=><article key={unit.id}><header><span><strong>{unit.title}</strong><small>الوحدة #{unit.id}{unit.description?` · ${unit.description}`:""}</small></span><span className="live-actions"><em>{lessons.filter((lesson)=>lesson.unitId===unit.id).length} دروس</em><button onClick={async()=>{const title=(await promptAction("اسم الوحدة",unit.title));if(!title)return;const description=(await promptAction("وصف الوحدة",unit.description||""));if(description===null)return;void mutate({action:"saveUnit",id:unit.id,courseSlug:selected,title,description,position:unit.position,status:unit.status},"تم تعديل الوحدة");}}>تعديل</button><button onClick={()=>void mutate({action:"saveUnit",id:unit.id,courseSlug:selected,title:unit.title,description:unit.description||"",position:unit.position,status:unit.status==="hidden"?"published":"hidden"},unit.status==="hidden"?"تم نشر الوحدة":"تم إخفاء الوحدة")}>{unit.status==="hidden"?"نشر":"إخفاء"}</button><AdminCapability all={["records.delete"]}><button className="danger-button" onClick={()=>onDelete("unit",unit.id,unit.title,"سيُحذف الدروس والفيديوهات والتقدم والملاحظات التابعة لهذه الوحدة.")}>حذف الوحدة</button></AdminCapability></span></header>{lessons.filter((lesson)=>lesson.unitId===unit.id).map((lesson)=><div key={lesson.id}><span><b>{lesson.title}</b><small>{lesson.durationSeconds>0?`${Math.floor(lesson.durationSeconds/60)}:${String(lesson.durationSeconds%60).padStart(2,"0")}`:"تُحسب بعد رفع الفيديو"} {lesson.freePreview?"· معاينة مجانية":""}{lesson.description?` · ${lesson.description}`:""}</small></span><span className="live-actions"><em title={data.videos.find((video)=>video.lessonId===lesson.id)?.processingError||undefined}>{videoStateLabel(data.videos.find((video)=>video.lessonId===lesson.id))}</em>{data.videos.filter((video)=>video.lessonId===lesson.id&&["failed","retrying"].includes(video.processingStatus||"")).map((video)=><button key={`retry-${video.id}`} onClick={()=>void retryVideo(video.id)}>إعادة المعالجة</button>)}<button onClick={async()=>{const title=(await promptAction("اسم الدرس",lesson.title));if(!title)return;const description=(await promptAction("وصف الدرس",lesson.description||""));if(description===null)return;void mutate({action:"saveLesson",id:lesson.id,courseSlug:selected,unitId:lesson.unitId,title,description,durationSeconds:lesson.durationSeconds,freePreview:lesson.freePreview,position:lesson.position,status:lesson.status},"تم تعديل الدرس");}}>تعديل</button><button onClick={()=>void mutate({action:"saveLesson",id:lesson.id,courseSlug:selected,unitId:lesson.unitId,title:lesson.title,description:lesson.description||"",durationSeconds:lesson.durationSeconds,freePreview:lesson.freePreview,position:lesson.position,status:lesson.status==="hidden"?"published":"hidden"},lesson.status==="hidden"?"تم نشر الدرس":"تم إخفاء الدرس")}>{lesson.status==="hidden"?"نشر":"إخفاء"}</button>{data.videos.filter((video)=>video.lessonId===lesson.id).map((video)=><AdminCapability key={video.id} all={["records.delete"]}><button key={video.id} className="danger-button" onClick={()=>onDelete("video",video.id,`فيديو ${lesson.title}`,"سيُحذف ملف الفيديو الخاص نهائيًا ويُفصل عن الدرس.")}>حذف الفيديو</button></AdminCapability>)}<AdminCapability all={["records.delete"]}><button className="danger-button" onClick={()=>onDelete("lesson",lesson.id,lesson.title,"سيُحذف الفيديو والتقدم والملاحظات المرتبطة بهذا الدرس.")}>حذف الدرس</button></AdminCapability></span></div>)}</article>)}</div></section><aside className="admin-panel live-builder-side"><h2>إضافة درس</h2><form onSubmit={submitLesson}><label>الوحدة
<SearchableSelect name="unitId" required><option value="">اختر</option>{units.map((unit)=><option key={unit.id} value={unit.id}>{unit.title}</option>)}</SearchableSelect>
</label><label>معرّف الدرس<input name="id" placeholder="يُنشأ تلقائيًا من العنوان" pattern="[A-Za-z0-9._-]{2,100}" dir="ltr"/></label><label>العنوان<input name="title" required/></label><label>الوصف (اختياري)<textarea name="description" placeholder="وصف مختصر للدرس"/></label><p className="live-hint">تُحسب مدة الدرس تلقائيًا من ملف الفيديو عند رفعه.</p><label className="live-check"><input name="freePreview" type="checkbox"/> درس تجريبي مجاني</label><button className="button button-primary">حفظ الدرس</button></form><h2>رفع فيديو خاص</h2><VideoUpload lessons={lessons} courseSlug={selected} reload={refresh}/></aside></div></> }


function VideoUpload({
  lessons,
  courseSlug,
  reload,
}: {
  lessons: LessonRow[];
  courseSlug: string;
  reload: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setBusy(true);
    setMessage("");

    const element = event.currentTarget;
    const form = new FormData(element);
    const file = form.get("file");
    const lessonId = String(form.get("lessonId") || "");

    if (!(file instanceof File)) {
      setMessage("اختر ملف فيديو صالحًا");
      setBusy(false);
      return;
    }

    const fallbackType = /\.mov$/i.test(file.name)
      ? "video/quicktime"
      : /\.webm$/i.test(file.name)
        ? "video/webm"
        : /\.mkv$/i.test(file.name)
          ? "video/x-matroska"
          : /\.avi$/i.test(file.name)
            ? "video/x-msvideo"
            : "video/mp4";

    const contentType = file.type || fallbackType;
    const controller = new AbortController();

    abortRef.current = controller;

    setProgress({
      loaded: 0,
      total: file.size,
      percent: 0,
      bytesPerSecond: 0,
      remainingSeconds: null,
    });

    try {
      const durationSeconds = await readBrowserVideoDuration(file, controller.signal);
      await uploadResumableVideo({ file, courseSlug, lessonId, contentType, durationSeconds,
        signal: controller.signal, onProgress: setProgress, onPhase: setMessage });
      setMessage("تم التحقق من الفيديو وربطه بالدرس؛ تجهيز الجودات جارٍ. عند انقطاع رفع آخر، اختر الملف نفسه لاستئنافه.");

      element.reset();
      await reload();
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "تعذر الاتصال أثناء الرفع",
      );
    } finally {
      abortRef.current = null;
      setProgress(null);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="live-hint">عند انقطاع الإنترنت أو إيقاف الرفع، أعد اختيار الملف نفسه والحساب والدرس نفسيهما خلال 24 ساعة لاستكمال الأجزاء الناقصة.</p>
      <label>
        الدرس
        <SearchableSelect name="lessonId" required>
          <option value="">اختر</option>
          {lessons.map((lesson) => (
            <option value={lesson.id} key={lesson.id}>
              {lesson.title}
            </option>
          ))}
        </SearchableSelect>
      </label>

      <label className="live-file">
        <Upload size={18} />
        <span>اختر ملف الفيديو حتى 200MB · رفع قابل للاستئناف</span>
        <input
          name="file"
          type="file"
          accept="video/*,.mkv,.avi,.mov"
          required
        />
      </label>

      {busy && progress && (
        <div className="upload-progress-card">
          <div>
            <span style={{ width: `${progress.percent}%` }} />
          </div>

          <small>{uploadProgressLabel(progress)}</small>

          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
          >
            <X size={14} />
            إيقاف مؤقت
          </button>
        </div>
      )}

      <button className="button button-soft" disabled={busy}>
        {busy ? "جارٍ رفع الفيديو..." : "رفع إلى المخزن الخاص"}
      </button>

      {message && <p className="live-hint">{message}</p>}
    </form>
  );
}

function Users({data,query,mutate,setDialog,role,onDelete}:{data:ConsoleData;query:string;mutate:(p:Record<string,unknown>,s?:string)=>Promise<boolean>;setDialog:(d:Dialog)=>void;role:"student"|"staff";onDelete:(entityType:string,entityId:string|number,label:string,impact:string)=>void}){const rows=data.users.filter((row)=>role==="student"?row.role==="student":row.role!=="student").filter((row)=>includesQuery(query,row.fullName,row.email,row.phone,row.specialty,row.academicLevel,...row.sessions.map((session)=>session.deviceLabel)));return <section className="admin-panel data-panel"><Table headers={["المستخدم","الدور","الجامعة والتخصص","الأجهزة","الحالة","إجراءات"]}>{rows.map((row)=><div className="live-table-row" key={row.id}><span className="live-entity"><i>{row.fullName[0]}</i><b>{row.fullName}<small>{row.email} · {row.phone||"بدون جوال"}</small></b></span>
<span>{row.role === "student" ? "طالب" : "مشرف"}<small>MFA: {row.mfaEnabled ? "مفعّل" : "غير مفعّل"}</small></span>
<span>{data.institutions.find((item)=>item.slug===row.universitySlug)?.name||"—"}<small>{row.specialty||"—"} · {row.academicLevel||"المستوى غير محدد"}</small></span><details className="device-session-list"><summary><ShieldCheck size={14}/>{row.deviceCount} / {role==="student"?data.deviceLimit:"—"} جهاز معتمد</summary>{row.sessions.length===0?<small>لا توجد جلسات نشطة.</small>:row.sessions.map((session)=><div key={session.id}><span><b>{session.deviceLabel}</b><small>{session.platform==="mobile"?"تطبيق":"ويب"} · آخر نشاط {new Date(session.lastSeenAt).toLocaleString("ar-SA")}</small></span><AdminCapability all={["students.devices.manage"]}><button type="button" onClick={()=>void mutate({action:"revokeUserSession",sessionId:session.id},`تم تسجيل خروج ${session.deviceLabel}`)}>تسجيل خروج الجهاز</button></AdminCapability></div>)}</details><em className={`status ${row.status==="active"?"published":"draft"}`}>{statusLabel(row.status)}</em><span className="live-actions">{role==="student"&&<Link className="student-profile-link" href={`/admin/students/${encodeURIComponent(row.email)}`}>ملف 360</Link>}<AdminCapability all={["students.manage"]}><button onClick={()=>void mutate({action:"updateUser",id:row.id,role:row.role,status:row.status==="active"?"suspended":"active"},row.status==="active"?"تم إيقاف الحساب":"تم تفعيل الحساب")}>{row.status==="active"?"إيقاف":"تفعيل"}</button></AdminCapability>{role==="student"&&<button onClick={()=>setDialog({kind:"access",user:row})}>منح مادة</button>}<AdminCapability all={["records.delete"]}><button className="danger-button" onClick={()=>onDelete("user",row.id,row.fullName,"سيُحذف الحساب وبيانات الجلسات والسلة والمفضلة والتقدم والطلبات غير المالية وملفات الدعم. سيُمنع إذا وُجد سجل مالي.")}>حذف نهائي</button></AdminCapability></span></div>)}</Table>{rows.length===0&&<p className="live-empty">لا توجد حسابات مطابقة.</p>}</section>}

function Subscriptions({data,query,mutate}:{data:ConsoleData;query:string;mutate:(p:Record<string,unknown>,s?:string)=>Promise<boolean>}){const now=Date.parse(data.generatedAt);const status=(row:AccessRow)=>row.revokedAt?"ملغي":row.suspendedAt?"متوقف مؤقتًا":row.startsAt&&Date.parse(row.startsAt)>now?"مجدول":row.expiresAt&&Date.parse(row.expiresAt)<=now?"منتهي":"نشط";const rows=data.access.filter((row)=>{const student=data.users.find((user)=>user.email===row.userEmail);const course=data.courses.find((item)=>item.slug===row.courseSlug);return includesQuery(query,row.userEmail,row.courseSlug,row.orderNumber,status(row),student?.fullName,student?.phone,course?.title,course?.university);});const active=rows.filter((row)=>status(row)==="نشط").length;const update=async(row:AccessRow,operation:"pause"|"resume"|"extend"|"revoke")=>{let reason="";if(operation==="pause"||operation==="revoke"){reason=(await promptAction(operation==="pause"?"سبب الإيقاف المؤقت":"سبب إلغاء الوصول"))?.trim()||"";if(!reason)return;}if(operation==="revoke"&&!await confirmAction("سيُوقف وصول الطالب إلى هذه المادة. هل تريد المتابعة؟"))return;void mutate({action:"updateAccess",id:row.id,operation,reason,days:operation==="extend"?30:undefined,operationKey:crypto.randomUUID()},operation==="pause"?"تم إيقاف الاشتراك مؤقتًا":operation==="resume"?"تم استئناف الاشتراك":operation==="extend"?"تم تمديد الاشتراك 30 يومًا":"تم إلغاء الوصول");};return <section className="subscription-manager"><div className="admin-metrics compact"><Metric icon={ShieldCheck} label="اشتراكات نشطة" value={String(active)} copy={`من ${rows.length} سجل ظاهر`} color="green"/><Metric icon={Activity} label="متوقفة أو منتهية" value={String(rows.length-active)} copy="يمكن مراجعتها واستئنافها" color="blue"/></div><div className="subscription-grid">{rows.map((row)=>{const student=data.users.find((user)=>user.email===row.userEmail);const course=data.courses.find((item)=>item.slug===row.courseSlug);const state=status(row);return <article className="subscription-card" key={row.id}><header><span className={`subscription-state state-${state==="نشط"?"active":state==="متوقف مؤقتًا"?"paused":state==="ملغي"?"revoked":"expired"}`}>{state}</span><small>#{row.id}</small></header><div className="subscription-student"><i>{(student?.fullName||row.userEmail)[0]}</i><span><strong>{student?.fullName||"طالب"}</strong><small dir="ltr">{row.userEmail}</small></span></div><div className="subscription-course"><BookOpen size={17}/><span><strong>{course?.title||row.courseSlug}</strong><small>{course?.university||""}</small></span></div><dl><div><dt>البداية</dt><dd>{new Date(row.startsAt).toLocaleDateString("ar-SA")}</dd></div><div><dt>الانتهاء</dt><dd>{row.expiresAt?new Date(row.expiresAt).toLocaleDateString("ar-SA"):"غير محدد"}</dd></div><div><dt>المصدر</dt><dd>{row.source==="tap"?"شراء عبر Tap":row.source==="admin_payment"?"دفعة يدوية":"منحة إدارية"}</dd></div><div><dt>الطلب</dt><dd dir="ltr">{row.orderNumber||"—"}</dd></div></dl>{(row.suspensionReason||row.revocationReason)&&<p className="subscription-reason">{row.suspensionReason||row.revocationReason}</p>}<footer>{state==="نشط"&&<button onClick={()=>update(row,"pause")}>إيقاف مؤقت</button>}{state==="متوقف مؤقتًا"&&<button className="primary" onClick={()=>update(row,"resume")}>استئناف</button>}{!row.revokedAt&&<button onClick={()=>update(row,"extend")}>+ 30 يومًا</button>}{!row.revokedAt&&<button className="danger-button" onClick={()=>update(row,"revoke")}>إلغاء الوصول</button>}</footer></article>})}</div>{rows.length===0&&<p className="live-empty">لا توجد اشتراكات مطابقة.</p>}</section>}

function Orders({data,query}:{data:ConsoleData;query:string}){const rows=data.orders.filter((row)=>includesQuery(query,row.orderNumber,row.customerName,row.customerEmail,row.courseSlug,row.status));return <section className="admin-panel data-panel"><div className="admin-metrics compact"><Metric icon={CircleDollarSign} label="الإيراد المؤكد" value={`${data.metrics.revenue.toLocaleString("ar-SA")} ر.س`} copy="من الطلبات المدفوعة فقط" color="blue"/><Metric icon={CreditCard} label="المدفوع" value={String(data.metrics.paidOrders)} copy={`من ${data.metrics.orders} طلب`} color="green"/></div><Table headers={["الطلب","الطالب","المادة","التاريخ","المبلغ","الحالة"]}>{rows.map((row)=><div className="live-table-row" key={row.orderNumber}><b dir="ltr">{row.orderNumber}</b><span>{row.customerName}<small>{row.customerEmail}</small></span><span>{data.courses.find((course)=>course.slug===row.courseSlug)?.title||row.courseSlug}</span><span>{new Date(row.createdAt).toLocaleDateString("ar-SA")}</span><strong>{row.total} {row.currency}</strong><em className={`status ${row.status==="paid"?"published":"draft"}`}>{statusLabel(row.status)}</em></div>)}</Table></section>}

function Requests({data,query,mutate,onDelete}:{data:ConsoleData;query:string;mutate:(p:Record<string,unknown>,s?:string)=>Promise<boolean>;onDelete:(entityType:string,entityId:string|number,label:string,impact:string)=>void}){const rows=data.requests.filter((row)=>includesQuery(query,row.id,row.student?.email,row.courseName,row.university,row.specialty,row.name,row.phone,row.student?.academicLevel,row.courseUrl,row.notes));const [selectedCourses,setSelectedCourses]=useState<Record<number,string>>({});return <section className="admin-panel data-panel"><div className="live-panel-note"><Upload size={17}/><p>يرفع الطالب سلايدات الدكتور أو توصيف المادة، ويمكنه إضافة رابط Google Drive أو أي رابط HTTPS للمادة. زر «تحميل الكل» يجمع جميع الملفات في ZIP واحد.</p></div><Table headers={["المادة","الطالب والمستوى","الجامعة والتخصص","المرفقات والرابط","التاريخ","الحالة","إجراء"]}>{rows.map((row)=>{const selected=selectedCourses[row.id]||row.preparedCourseSlug||"";const courseOptions=data.courses.filter((course)=>course.university===row.university&&(course.audienceScope==="institution"||course.specialty===row.specialty));return <div className="live-table-row" key={row.id}><strong>{row.courseName}<small>#{row.id}{row.notes?` · ${row.notes.slice(0,80)}`:""}</small></strong><span>{row.name}<small>{row.student?.email||"—"} · {row.phone} · {row.student?.academicLevel||"المستوى غير محدد"}</small></span><span>{row.university}<small>{row.specialty}</small></span><span className="request-admin-files">{row.courseUrl&&<a href={row.courseUrl} target="_blank" rel="noopener noreferrer">فتح رابط المادة</a>}{row.files?.length?<><a className="download-all" href={`/api/admin/course-requests/${row.id}/download`}><Upload size={13}/>تحميل الكل ZIP</a>{row.files.map((file)=><a key={file.id} href={`/api/supervisor/request-files/${file.id}`} target="_blank" rel="noreferrer" title="تنزيل المرفق"><Paperclip size={13}/>{file.originalName}</a>)}</>:<small>لا توجد ملفات</small>}</span><span>{new Date(row.createdAt).toLocaleDateString("ar-SA")}</span>
<SearchableSelect value={row.status} onChange={(event)=>void mutate({action:"updateRequest",id:row.id,status:event.target.value,courseSlug:event.target.value==="available"?selected:undefined},"تم تحديث الطلب")}><option value="new">جديد</option><option value="assigned">مسند</option><option value="reviewing">مراجعة</option><option value="planned">مخطط</option><option value="producing">إنتاج</option><option value="available">متاح</option><option value="declined">متعذر</option></SearchableSelect>
<div className="request-prepare-actions">
<SearchableSelect value={selected} onChange={(event)=>setSelectedCourses((current)=>({...current,[row.id]:event.target.value}))}><option value="">اختر المادة المنشورة</option>{courseOptions.map((course)=><option key={course.slug} value={course.slug}>{course.title} · {course.specialty}</option>)}</SearchableSelect>
<AdminCapability all={["requests.manage","catalog.manage"]}><button type="button" disabled={!selected} onClick={()=>void mutate({action:"prepareRequest",id:row.id,courseSlug:selected},"تم تجهيز الطلب وإرسال الإشعار")}>تم تجهيز الطلب</button></AdminCapability><AdminCapability all={["records.delete"]}><button type="button" className="danger-button" onClick={()=>onDelete("course_request",row.id,row.courseName,"سيُحذف الطلب وجميع ملفاته من التخزين نهائيًا، ولن يؤثر على الطلبات المدفوعة.")}>حذف الطلب</button></AdminCapability></div></div>})}</Table>{rows.length===0&&<p className="live-empty">لا توجد طلبات مطابقة للبحث.</p>}</section>}

function Support({data,query,mutate,refresh,onDelete}:{data:ConsoleData;query:string;mutate:(p:Record<string,unknown>,s?:string)=>Promise<boolean>;refresh:()=>Promise<void>;onDelete:(entityType:string,entityId:string|number,label:string,impact:string)=>void}){
  const rows=data.tickets.filter((row)=>includesQuery(query,row.ticketNumber,row.title,row.message,row.userEmail,row.category));
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const selected=rows.find((row)=>row.id===selectedId)||null;
  if(!selected)return <div className="live-ticket-grid compact-tickets">{rows.map((row)=><article className="admin-panel live-ticket" key={row.id}><header><span><strong>{row.title}</strong><small dir="ltr">{row.ticketNumber} · {row.userEmail||"—"}</small>{row.student&&<small className="ticket-student-details">{row.student.fullName} · {row.student.phone||"بدون جوال"} · {row.student.universitySlug||"بدون جامعة"} · {row.student.specialty||"بدون تخصص"}</small>}</span><em>{statusLabel(row.status)}</em></header><div className="ticket-card-actions"><button className="button button-soft" onClick={()=>setSelectedId(row.id)}>فتح المحادثة</button><AdminCapability all={["records.delete"]}><button className="ticket-delete-button" onClick={()=>onDelete("support_ticket",row.id,row.title,"سيُحذف عنوان التذكرة والمحادثة وجميع المرفقات من قاعدة البيانات والتخزين نهائيًا.")}>حذف نهائي</button></AdminCapability></div></article>)}</div>;
  return <section className="admin-panel admin-support-chat-panel">
    <header className="admin-support-chat-head"><button type="button" className="button button-ghost ticket-back-button" onClick={()=>setSelectedId(null)}>كل التذاكر</button><span><strong>{selected.title}</strong><small><bdi dir="ltr">{selected.ticketNumber} · {selected.userEmail||"—"}</bdi> · {selected.contactChannel==="whatsapp"?"واتساب":selected.contactChannel==="email"?"البريد الإلكتروني":"داخل المنصة"}</small>{selected.student&&<small className="ticket-student-details">{selected.student.fullName} · {selected.student.phone||"بدون جوال"} · {selected.student.universitySlug||"بدون جامعة"} · {selected.student.specialty||"بدون تخصص"} · {selected.student.academicLevel||"المستوى غير محدد"}</small>}</span><em>{statusLabel(selected.status)}</em></header>
    <SupportChatThread key={selected.id} ticket={selected} isManager onReload={refresh}/>
    <div className="admin-support-status"><label>حالة المحادثة
<SearchableSelect value={selected.status} onChange={(event)=>void mutate({action:"updateTicket",id:selected.id,status:event.target.value,reply:""},"تم تحديث حالة المحادثة")}><option value="open">مفتوحة</option><option value="waiting">بانتظار الطالب</option><option value="resolved">محلولة</option><option value="closed">مغلقة</option></SearchableSelect>
</label><AdminCapability all={["records.delete"]}><button className="danger-button" onClick={()=>onDelete("support_ticket",selected.id,selected.title,"سيُحذف عنوان التذكرة والمحادثة وجميع المرفقات من قاعدة البيانات والتخزين نهائيًا.")}>حذف نهائي</button></AdminCapability></div>
  </section>;
}

function Reviews({data,query,mutate,onDelete}:{data:ConsoleData;query:string;mutate:(p:Record<string,unknown>,s?:string)=>Promise<boolean>;onDelete:(entityType:string,entityId:string|number,label:string,impact:string)=>void}){const rows=data.reviews.filter((row)=>includesQuery(query,row.userEmail,row.courseSlug,row.body,row.status));return <section className="admin-panel data-panel"><div className="live-panel-note"><Star size={17}/><p>لا توجد تقييمات مزيفة جاهزة. تظهر هنا آراء طلاب لديهم شراء وتقدم مشاهدة فقط، ثم تنشر بعد المراجعة.</p></div><Table headers={["الطالب","المادة","التقييم","الرأي","الحالة","إجراء"]}>{rows.map((row)=><div className="live-table-row" key={row.id}><span>{row.userEmail}</span><span>{data.courses.find((course)=>course.slug===row.courseSlug)?.title||row.courseSlug}</span><strong className="live-stars">{"★".repeat(row.rating)}</strong><p>{row.body}</p><em>{statusLabel(row.status)}</em><span className="live-actions">
<SearchableSelect value={row.status} onChange={(event)=>void mutate({action:"updateReview",id:row.id,status:event.target.value},"تمت مراجعة التقييم")}><option value="pending">معلق</option><option value="published">نشر</option><option value="rejected">رفض</option></SearchableSelect>
<AdminCapability all={["records.delete"]}><button className="danger-button" onClick={()=>onDelete("review",row.id,`تقييم ${row.courseSlug}`,"سيُحذف التقييم فقط مع إبقاء المادة والحساب وسجل التدقيق.")}>حذف التقييم</button></AdminCapability></span></div>)}</Table></section>}

function Notifications({data,mutate,onDelete}:{data:ConsoleData;mutate:(p:Record<string,unknown>,s?:string)=>Promise<boolean>;onDelete:(entityType:string,entityId:string|number,label:string,impact:string)=>void}) {
  const [audience,setAudience]=useState("student");
  const [courseAction,setCourseAction]=useState("");
  const [userSearch,setUserSearch]=useState("");
  const [targetEmail,setTargetEmail]=useState("");
  const templates=[
    {id:"general",label:"إعلان عام",copy:"رسالة مرنة لجميع الحالات"},
    {id:"discount",label:"تخفيض",copy:"عرض وسعر خاص"},
    {id:"new-course",label:"مادة جديدة",copy:"إطلاق شرح جديد"},
    {id:"new-service",label:"خدمة جديدة",copy:"ميزة أو خدمة جديدة"},
    {id:"urgent",label:"تنبيه مهم",copy:"إعلان يحتاج انتباهًا"},
    {id:"success",label:"خبر سار",copy:"إنجاز أو توفر جديد"},
  ];
  const matchingUsers=data.users.filter((user)=>includesQuery(userSearch,user.fullName,user.email,user.phone,user.specialty)).slice(0,8);
  const selectedUser=data.users.find((user)=>user.email===targetEmail);
  return <div className="live-form-layout">
    <form className="admin-panel live-admin-form" onSubmit={async(event)=>{
      event.preventDefault();
      const element=event.currentTarget;
      const form=new FormData(element);
      if(audience==="user"&&!targetEmail)return;
      const manual=String(form.get("actionUrl")||"").trim();
      const selectedCourse=String(form.get("courseAction")||"").trim();
      const actionUrl=manual||(selectedCourse?`/courses/${selectedCourse}`:"");
      const ok=await mutate({
        action:"createNotification",
        audience:form.get("audience"),
        userEmail:audience==="user"?targetEmail:"",
        title:form.get("title"),body:form.get("body"),template:form.get("template"),
        actionUrl,actionLabel:form.get("actionLabel"),presentation:form.get("presentation"),
        pushEnabled:form.get("pushEnabled")==="on",startsAt:form.get("startsAt"),expiresAt:form.get("expiresAt"),dismissible:form.get("dismissible")==="on",
        segmentUniversity:form.get("segmentUniversity"),segmentSpecialty:form.get("segmentSpecialty"),segmentCourse:form.get("segmentCourse"),segmentAccessState:form.get("segmentAccessState"),segmentInactiveDays:form.get("segmentInactiveDays"),
      },"تم نشر الإشعار");
      if(ok){element.reset();setAudience("student");setCourseAction("");setUserSearch("");setTargetEmail("");}
    }}>
      <h2>إنشاء إعلان وإشعار</h2>
      <p className="live-form-help">اعرضه في مركز الإشعارات أو كشريط إعلاني أو نافذة منبثقة. زر الإعلان يمكنه فتح مادة داخل المنصة أو رابط HTTPS خارجي.</p>
      <label>الجمهور
<SearchableSelect name="audience" value={audience} onChange={(event)=>{setAudience(event.target.value);setTargetEmail("");setUserSearch("");}}><option value="student">جميع الطلاب</option><option value="segment">شريحة طلاب محددة</option><option value="public">كل الزوار والطلاب</option><option value="supervisor">المشرفون</option><option value="admin">الإدارة</option><option value="user">مستخدم محدد</option></SearchableSelect>
</label>
      {audience==="segment"&&<fieldset className="notification-segment-fields"><legend>استهداف الشريحة</legend><label>الجامعة
<SearchableSelect name="segmentUniversity"><option value="">كل الجامعات</option>{data.institutions.map((item)=><option value={item.slug} key={item.slug}>{item.name}</option>)}</SearchableSelect>
</label><label>التخصص
<SearchableSelect name="segmentSpecialty"><option value="">كل التخصصات</option>{data.specialties.map((item)=><option value={item.name} key={item.slug}>{item.name}</option>)}</SearchableSelect>
</label><label>مادة مشترك بها
<SearchableSelect name="segmentCourse"><option value="">أي مادة</option>{data.courses.map((item)=><option value={item.slug} key={item.slug}>{item.title}</option>)}</SearchableSelect>
</label><label>حالة الاشتراك
<SearchableSelect name="segmentAccessState"><option value="">أي حالة</option><option value="active">لديه وصول نشط</option><option value="expired">منتهي أو موقوف</option><option value="none">دون اشتراك</option></SearchableSelect>
</label><label>لم يدخل منذ (يوم)<input name="segmentInactiveDays" type="number" min="0" max="3650" placeholder="مثال: 30"/></label><small>تُحسب القائمة في الخادم عند النشر، ويُسجل عدد المستلمين في سجل التدقيق.</small></fieldset>}
      {audience==="user"&&<div className="notification-user-picker"><label>ابحث عن المستخدم<input value={userSearch} onChange={(event)=>setUserSearch(event.target.value)} placeholder="الاسم أو البريد أو الجوال" autoComplete="off"/></label>{selectedUser?<div className="notification-user-selected"><span><strong>{selectedUser.fullName}</strong><small dir="ltr">{selectedUser.email} · {selectedUser.phone||"بدون جوال"}</small></span><button type="button" onClick={()=>setTargetEmail("")}>تغيير</button></div>:<div className="notification-user-results">{matchingUsers.map((user)=><button type="button" key={user.id} onClick={()=>{setTargetEmail(user.email);setUserSearch(user.fullName);}}><span><strong>{user.fullName}</strong><small>{user.specialty||"بدون تخصص"}</small></span><em dir="ltr">{user.email}</em></button>)}{userSearch&&matchingUsers.length===0&&<small>لا يوجد مستخدم مطابق لهذا البحث.</small>}</div>}</div>}
      <label>قالب الإعلان
<SearchableSelect name="template" defaultValue="general">{templates.map((template)=><option value={template.id} key={template.id}>{template.label} — {template.copy}</option>)}</SearchableSelect>
</label>
      <div className="announcement-template-grid">{templates.slice(1).map((template)=><div key={template.id} className={`announcement-template-preview announcement-template-${template.id}`}><b>{template.label}</b><small>{template.copy}</small></div>)}</div>
      <label>العنوان<input name="title" required/></label>
      <label>النص<textarea name="body" required/></label>
      <label>طريقة العرض
<SearchableSelect name="presentation"><option value="inbox">مركز الإشعارات</option><option value="banner">شريط أعلى المنصة</option><option value="modal">نافذة منبثقة عند الدخول</option><option value="all">مركز الإشعارات + الشريط + النافذة المنبثقة</option></SearchableSelect>
</label>
      <label>اربط الزر بمادة داخل النظام
<SearchableSelect name="courseAction" value={courseAction} onChange={(event)=>setCourseAction(event.target.value)}><option value="">بدون مادة</option>{data.courses.map((course)=><option key={course.slug} value={course.slug}>{course.title} — {course.university}</option>)}</SearchableSelect>
</label>
      <label>أو رابط داخلي / خارجي HTTPS<input name="actionUrl" placeholder="/requests أو https://example.com" dir="ltr"/></label>
      <label>نص الزر<input name="actionLabel" placeholder="فتح التفاصيل" maxLength={80}/></label>
      <div className="two-fields"><label>يبدأ في<input name="startsAt" type="datetime-local"/></label><label>ينتهي في<input name="expiresAt" type="datetime-local"/></label></div>
      <label className="live-check"><input name="pushEnabled" type="checkbox" defaultChecked/> إرسال إشعار فوري للأجهزة المسجلة</label>
      <label className="live-check"><input name="dismissible" type="checkbox" defaultChecked/> السماح بإخفاء الإعلان</label>
      <button className="button button-primary" disabled={audience==="user"&&!targetEmail}>نشر الإعلان</button>
    </form>
    <section className="admin-panel live-list"><h2>آخر الإشعارات</h2><button type="button" className="button button-soft" onClick={()=>void mutate({action:"dispatchNotifications"},"تم فحص حملات الإشعارات الفورية المستحقة")}>إرسال الحملات المستحقة الآن</button>{data.notifications.slice(0,30).map((row)=><article key={row.id} className={`announcement-template-${row.template||"general"}`}><Bell size={17}/><span><strong>{row.title}</strong><small>{notificationTemplateLabel(row.template)} · {notificationPresentationLabel(row.presentation)} · {notificationAudienceLabel(row.audience)} · {row.userEmail||"عام"}{row.pushEnabled===false?" · داخل المنصة فقط":" · إشعار فوري"}</small><p>{row.body}</p>{row.actionUrl&&(row.actionUrl.startsWith("https://")?<a href={row.actionUrl} target="_blank" rel="noopener noreferrer">{row.actionLabel||"فتح الرابط"}</a>:<Link href={row.actionUrl}>{row.actionLabel||"فتح الرابط"}</Link>)}<AdminCapability all={["records.delete"]}><button className="danger-button" onClick={()=>onDelete("notification",row.id,row.title,"سيُحذف الإشعار من صندوق المستلمين، ولن يُحذف سجل التدقيق.")}>حذف الإشعار</button></AdminCapability></span></article>)}</section>
  </div>;
}

function Coupons({data,mutate,onDelete}:{data:ConsoleData;mutate:(p:Record<string,unknown>,s?:string)=>Promise<boolean>;onDelete:(entityType:string,entityId:string|number,label:string,impact:string)=>void}){return <div className="live-form-layout"><form className="admin-panel live-admin-form" onSubmit={async(event)=>{event.preventDefault();const form=Object.fromEntries(new FormData(event.currentTarget));const ok=await mutate({action:"saveCoupon",...form},"تم حفظ الكوبون");if(ok)event.currentTarget.reset();}}><h2>إنشاء/تحديث كوبون</h2><p className="live-form-help">يُعاد التحقق من الكود والمادة والتواريخ في الخادم عند العرض وعند الدفع، ولا يعتمد النظام على قيمة الواجهة.</p><label>الكود<input name="code" required minLength={3} maxLength={40} dir="ltr"/></label><div className="two-fields"><label>النوع
<SearchableSelect name="type"><option value="percent">نسبة %</option><option value="fixed">مبلغ ثابت</option></SearchableSelect>
</label><label>القيمة<input name="value" type="number" min="1" step="0.01" required/></label></div><label>مادة محددة (اختياري)
<SearchableSelect name="courseSlug"><option value="">كل المواد</option>{data.courses.map((course)=><option value={course.slug} key={course.slug}>{course.title}</option>)}</SearchableSelect>
</label><label>حد الاستخدام<input name="usageLimit" type="number" min="1" step="1"/></label><div className="two-fields"><label>يبدأ في<input name="startsAt" type="datetime-local"/></label><label>ينتهي في<input name="expiresAt" type="datetime-local"/></label></div><label>الحالة
<SearchableSelect name="status" defaultValue="active"><option value="active">نشط</option><option value="disabled">متوقف</option></SearchableSelect>
</label><button className="button button-primary">حفظ الكوبون</button></form><section className="admin-panel live-list"><h2>الكوبونات</h2>{data.coupons.map((row)=><article key={row.id}><TicketPercent size={18}/><span><strong dir="ltr">{row.code}</strong><small>{row.type==="percent"?`${row.value}%`:`${row.value} ر.س`} · {row.courseSlug?`للمادة ${data.courses.find((course)=>course.slug===row.courseSlug)?.title||row.courseSlug}`:"كل المواد"} · استُخدم {row.usedCount}{row.usageLimit?`/${row.usageLimit}`:""}</small></span><em>{statusLabel(row.status)}</em><AdminCapability all={["records.delete"]}><button className="danger-button" onClick={()=>onDelete("coupon",row.code,row.code,"سيُحذف الكوبون فقط، ولا يعيد كتابة الطلبات أو الفواتير السابقة.")}>حذف الكوبون</button></AdminCapability></article>)}</section></div>}

const settingFields:ReadonlyArray<{key:string;label:string;type?:"email"|"number";dir?:"ltr";min?:number;max?:number;hint?:string}>=[
  {key:"legal_name",label:"الاسم النظامي للمنشأة",hint:"اكتبه كما يظهر في السجل التجاري."},
  {key:"commercial_registration_number",label:"رقم السجل التجاري",dir:"ltr"},
  {key:"commercial_registration_verify_url",label:"رابط التحقق من السجل (اختياري)",dir:"ltr"},
  {key:"ecommerce_authentication_number",label:"رقم توثيق المتجر الإلكتروني",dir:"ltr"},
  {key:"ecommerce_authentication_verify_url",label:"رابط التحقق من توثيق المتجر (اختياري)",dir:"ltr"},
  {key:"nelc_program_name",label:"اسم البرنامج المشمول بترخيص التعليم الإلكتروني"},
  {key:"nelc_program_license_number",label:"رقم ترخيص البرنامج",dir:"ltr"},
  {key:"nelc_program_license_verify_url",label:"رابط التحقق من الترخيص (اختياري)",dir:"ltr"},
  {key:"employment_authorization_number",label:"مرجع توثيق التوظيف لدى الوزارة",dir:"ltr"},
  {key:"employment_authorization_verify_url",label:"رابط التحقق من توثيق التوظيف",dir:"ltr"},
  {key:"instructor_identity_legal_basis",label:"السند النظامي لجمع نسخ الهوية",hint:"أدخل المرجع النظامي الفعلي؛ رقم السجل التجاري وحده لا يحدد أساس جمع الهوية."},
  {key:"instructor_identity_retention_days",label:"مدة الاحتفاظ بالهوية بالأيام",type:"number",min:1,max:365,hint:"مدة معتمدة تناسب غرض التحقق؛ تتوقف إتاحة الوثيقة عند انتهائها ثم تُحذف من التخزين."},
  {key:"legal_address",label:"العنوان النظامي"},
  {key:"vat_number",label:"الرقم الضريبي — عند الانطباق",dir:"ltr"},
  {key:"positioning_claim",label:"الوصف التعريفي للمنصة",hint:"يظهر في الواجهة الرئيسية."},
  {key:"first_platform_claim_text",label:"نص عبارة «أول منصة»",hint:"يظهر مباشرة في الرئيسية."},
  {key:"support_email",label:"بريد الدعم",type:"email"},
  {key:"support_hours",label:"ساعات الدعم"},
  {key:"footer_description",label:"وصف التذييل"},
  {key:"app_download_title",label:"عنوان قسم تنزيل التطبيق"},
  {key:"app_download_description",label:"وصف قسم تنزيل التطبيق"},
  {key:"ios_app_url",label:"رابط App Store للآيفون",dir:"ltr"},
  {key:"android_app_url",label:"رابط Google Play للأندرويد",dir:"ltr"},
  {key:"whatsapp_number",label:"رقم واتساب",dir:"ltr"},
  {key:"whatsapp_message",label:"رسالة واتساب الافتراضية"},
  {key:"social_x",label:"رابط X",dir:"ltr"},
  {key:"social_instagram",label:"رابط Instagram",dir:"ltr"},
  {key:"social_tiktok",label:"رابط TikTok",dir:"ltr"},
  {key:"social_youtube",label:"رابط YouTube",dir:"ltr"},
  {key:"social_telegram",label:"رابط Telegram",dir:"ltr"},
  {key:"social_linkedin",label:"رابط LinkedIn",dir:"ltr"},
  {key:"social_facebook",label:"رابط Facebook",dir:"ltr"},
  {key:"social_snapchat",label:"رابط Snapchat",dir:"ltr"},
  {key:"social_threads",label:"رابط Threads",dir:"ltr"},
];
const settingsSections = [
  { title: "بيانات المنشأة والتوثيق", description: "الأرقام التي تحفظها هنا تظهر مباشرة في الرئيسية والتذييل.", keys: ["legal_name", "commercial_registration_number", "employment_authorization_number", "employment_authorization_verify_url", "ecommerce_authentication_number", "nelc_program_name", "nelc_program_license_number", "vat_number", "legal_address", "commercial_registration_verify_url", "ecommerce_authentication_verify_url", "nelc_program_license_verify_url"] },
  { title: "خصوصية مستندات الشارحين", description: "لا يُفعّل رفع الهوية حتى يحفظ المدير الأعلى المرجع النظامي ومدة الاحتفاظ المعتمدة.", keys: ["instructor_identity_legal_basis", "instructor_identity_retention_days"] },
  { title: "هوية المنصة ومحتوى الرئيسية", description: "حدّث النصوص التعريفية والعبارة الرئيسية من مكان واحد.", keys: ["positioning_claim", "first_platform_claim_text", "footer_description"] },
  { title: "تطبيقات الجوال", description: "عناوين التنزيل وروابط المتاجر التي يراها الطلاب.", keys: ["app_download_title", "app_download_description", "ios_app_url", "android_app_url"] },
  { title: "التواصل والدعم", description: "قنوات خدمة الطلاب وحسابات المنصة.", keys: ["support_email", "support_hours", "whatsapp_number", "whatsapp_message", "social_x", "social_instagram", "social_tiktok", "social_youtube", "social_telegram", "social_linkedin", "social_facebook", "social_snapchat", "social_threads"] },
];

function PlatformSettings({ data, mutate }: { data: ConsoleData; mutate: (p: Record<string, unknown>, s?: string) => Promise<boolean> }) {
  const { owner } = useAdminAccess();
  const [saving, setSaving] = useState(false);
  return <>
    <form className="admin-panel live-settings admin-settings-form" onSubmit={async (event) => {
      event.preventDefault();
      if (saving) return;
      const values = Object.fromEntries(new FormData(event.currentTarget));
      setSaving(true);
      try { await mutate({ action: "saveSettings", values }, "تم تحديث إعدادات المنصة"); }
      finally { setSaving(false); }
    }}>
      {settingsSections.filter(section => owner || !section.keys.includes("instructor_identity_legal_basis")).map((section) => <fieldset className="admin-settings-section" key={section.title}>
        <legend>{section.title}</legend>
        <p>{section.description}</p>
        <div className="admin-settings-fields">
          {section.keys.map((key) => {
            const field = settingFields.find((item) => item.key === key)!;
            return <label key={field.key}>{field.label}
              <input name={field.key} type={field.type || "text"} min={field.min} max={field.max} defaultValue={data.settings[field.key] || ""} dir={field.dir} />
              {field.hint ? <small>{field.hint}</small> : null}
            </label>;
          })}
        </div>
      </fieldset>)}
      <fieldset className="admin-settings-section">
        <legend>المشاهدة وتجربة الطالب</legend>
        <div className="admin-settings-fields">
          <label>إظهار Tap وتابي وتمارا في الرئيسية
            <SearchableSelect name="payment_methods_marketing_enabled" defaultValue={data.settings.payment_methods_marketing_enabled || "true"}>
              <option value="false">إخفاء من الرئيسية</option><option value="true">إظهار في الرئيسية</option>
            </SearchableSelect>
          </label>
          <label>طريقة مشاهدة المحتوى
            <SearchableSelect name="content_view_mode" defaultValue={data.settings.content_view_mode || "both"}>
              <option value="both">الويب والتطبيق معًا</option><option value="app_only">التطبيق فقط</option><option value="web_only">الويب فقط</option>
            </SearchableSelect>
            <small>الدروس التجريبية متاحة في الويب والتطبيق دائمًا.</small>
          </label>
          <label>الحد الأقصى لأجهزة الطالب
            <input name="max_student_devices" type="number" value="2" readOnly aria-describedby="student-device-limit-hint" />
            <small id="student-device-limit-hint">أول جهازين معتمدين عبر الويب والتطبيق. تسجيل الخروج لا يحرر مكانًا، والاستبدال من ملف الطالب بإجراء إداري موثّق.</small>
          </label>
        </div>
        <label className="admin-settings-announcement">تنبيه عام<textarea name="announcement" defaultValue={data.settings.announcement || ""} maxLength={500} /></label>
      </fieldset>
      <footer className="admin-settings-save"><span>تُطبق التغييرات بعد الحفظ.</span><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{saving ? "جارٍ الحفظ..." : "حفظ جميع الإعدادات"}</button></footer>
    </form>
    <AppearanceSettings />
  </>;
}

const prettyJson=(value?:string|null)=>{if(!value)return "";try{return JSON.stringify(JSON.parse(value),null,2);}catch{return value;}};
function Audit({data,query}:{data:ConsoleData;query:string}){const rows=data.audit.filter((row)=>includesQuery(query,row.actorEmail,row.action,row.entityType,row.entityId));return <section className="admin-panel data-panel"><div className="live-panel-note"><Activity size={17}/><p>يشمل السجل عمليات لوحة الإدارة وجميع المراكز (المالية، الإحالات، أدوات مراس، الباقات، المسارات). افتح أي صف لعرض القيم قبل التغيير وبعده.</p></div><Table headers={["الوقت","المنفذ","العملية","نوع السجل","المعرّف","التفاصيل"]}>{rows.map((row)=>{const before=prettyJson(row.beforeJson);const after=prettyJson(row.afterJson);return <div className="live-table-row" key={row.id}><span>{new Date(row.createdAt).toLocaleString("ar-SA")}</span><strong>{row.actorEmail}<small dir="ltr">{row.ipAddress||""}</small></strong><span>{auditActionLabel(row.action)}</span><span>{auditEntityLabel(row.entityType)}<small dir="ltr">{row.entityType}</small></span><span dir="ltr">{row.entityId||"—"}</span>{before||after?<details className="audit-diff"><summary>عرض التغيير</summary>{before&&<div><small>قبل</small><pre dir="ltr">{before}</pre></div>}{after&&<div><small>بعد</small><pre dir="ltr">{after}</pre></div>}</details>:<span>—</span>}</div>;})}</Table>{rows.length===0&&<p className="live-empty">لا توجد سجلات مطابقة.</p>}</section>}

function AdminDialog({dialog,data,close,mutate,refresh}:{dialog:Exclude<Dialog,null>;data:ConsoleData;close:()=>void;mutate:(p:Record<string,unknown>,s?:string)=>Promise<boolean>;refresh:()=>Promise<void>}){const[busy,setBusy]=useState(false);const[error,setError]=useState("");const[operationKey]=useState(()=>crypto.randomUUID());const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();setBusy(true);setError("");const form=new FormData(event.currentTarget);try{if(dialog.kind==="institution"){const institutionKey=String(form.get("slug")||automaticIdentifier(String(form.get("name")||""),"university",80,operationKey));if(!await mutate({action:"saveInstitution",intent:dialog.item?"update":"create",slug:institutionKey,name:form.get("name"),nameEn:form.get("nameEn"),region:form.get("region"),type:form.get("type"),domain:form.get("domain"),directorySourceUrl:form.get("directorySourceUrl"),verificationStatus:form.get("verificationStatus"),aliases:String(form.get("aliases")||"").split("\n").map((value)=>value.trim()).filter(Boolean),logoUrl:form.get("logoUrl"),status:form.get("status"),featured:form.get("featured")==="on"}))throw new Error("تعذر حفظ بيانات الجهة");const file=form.get("logoFile");if(file instanceof File&&file.size){const upload=new FormData();upload.set("slug",institutionKey);upload.set("file",file);const response=await adminFetch("/api/admin/logos",{method:"POST",credentials:"same-origin",body:upload});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||"تعذر رفع الشعار");await refresh();}}else if(dialog.kind==="specialty"){if(!await mutate({action:"saveSpecialty",intent:dialog.item?"update":"create",slug:form.get("slug")||automaticIdentifier(String(form.get("name")||""),"specialty",80,operationKey),name:form.get("name"),description:form.get("description"),sourceUrl:form.get("sourceUrl"),verifiedAt:form.get("verifiedAt"),verificationStatus:form.get("verificationStatus"),faculty:form.get("faculty"),degree:form.get("degree"),status:form.get("status"),institutionSlug:form.get("institutionSlug")}))throw new Error("تعذر حفظ التخصص");}else if(dialog.kind==="course"){const courseKey=String(form.get("slug")||automaticIdentifier(String(form.get("title")||""),"course",80,operationKey));if(!await mutate({action:"saveCourse",intent:dialog.item?"update":"create",slug:courseKey,title:form.get("title"),titleEn:form.get("titleEn"),code:form.get("code"),description:form.get("description"),coverImageUrl:form.get("coverImageUrl"),institutionSlug:form.get("institutionSlug"),specialtySlug:form.get("specialtySlug"),audienceScope:form.get("audienceScope"),price:Number(form.get("price")),oldPrice:Number(form.get("oldPrice")),accessLabel:form.get("accessLabel"),sourceUrl:form.get("sourceUrl"),verifiedAt:form.get("verifiedAt"),status:form.get("status"),featured:form.get("featured")==="on",coverTheme:form.get("coverTheme")}))throw new Error("تعذر حفظ المادة");const coverFile=form.get("coverFile");if(coverFile instanceof File&&coverFile.size){const upload=new FormData();upload.set("courseSlug",courseKey);upload.set("file",coverFile);const response=await adminFetch("/api/admin/covers",{method:"POST",credentials:"same-origin",body:upload});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||"تعذر رفع غلاف المادة");await refresh();}}else if(dialog.kind==="staff"){const response=await adminFetch("/api/admin/staff",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({email:form.get("email"),fullName:form.get("fullName"),phone:form.get("phone"),password:form.get("password"),role:form.get("role"),universitySlug:form.get("universitySlug"),specialty:form.get("specialty")})});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||"تعذر حفظ الموظف");await refresh();}else if(dialog.kind==="access"){if(!await mutate({action:"grantAccess",operationKey,userId:dialog.user.id,userEmail:dialog.user.email,courseSlug:form.get("courseSlug"),grantType:form.get("grantType"),price:Number(form.get("price")),expiresAt:form.get("expiresAt")},"تم منح صلاحية المادة"))throw new Error("تعذر منح صلاحية المادة");}close();}catch(caught){setError(caught instanceof Error?caught.message:"تعذر الحفظ");setBusy(false);}};const item=dialog.kind==="institution"?dialog.item:dialog.kind==="specialty"?dialog.item:dialog.kind==="course"?dialog.item:undefined;return <div className="admin-modal-overlay"><button onClick={close} aria-label="إغلاق"/><form className="admin-modal live-modal" onSubmit={submit}><div><span><Settings size={19}/></span><div><h2>{dialog.kind==="access"?`منح مادة إلى ${dialog.user.fullName}`:item?"تعديل السجل":"إضافة سجل جديد"}</h2><p>يحفظ التغيير في قاعدة البيانات ويسجل في سجل النشاط.</p></div><button type="button" onClick={close}><X size={19}/></button></div>{dialog.kind==="institution"&&<><label>المعرّف (يدوي أو تلقائي عند الإضافة)<input name="slug" readOnly={Boolean(dialog.item)} placeholder="اختياري: اتركه فارغًا للتوليد التلقائي" defaultValue={dialog.item?.slug} pattern="[A-Za-z0-9._-]{2,80}" dir="ltr"/></label><label>الاسم العربي<input name="name" required defaultValue={dialog.item?.name}/></label><label>الاسم الإنجليزي<input name="nameEn" defaultValue={dialog.item?.nameEn} dir="ltr"/></label><div className="two-fields"><label>المنطقة<input name="region" required defaultValue={dialog.item?.region}/></label><label>النوع
<SearchableSelect name="type" defaultValue={dialog.item?.type||"حكومية"}><option>حكومية</option><option>أهلية</option><option>كلية</option><option>تقنية</option></SearchableSelect>
</label></div><label>النطاق الرسمي<input name="domain" defaultValue={dialog.item?.domain} placeholder="university.edu.sa" dir="ltr"/></label><label>رابط دليل الجهة HTTPS<input name="directorySourceUrl" defaultValue={dialog.item?.directorySourceUrl} placeholder="https://..." dir="ltr"/></label><label>الأسماء البديلة (كل اسم في سطر)<textarea name="aliases" defaultValue={(dialog.item?.aliases||[]).join("\n")} /></label><div className="two-fields"><label>حالة التحقق
<SearchableSelect name="verificationStatus" defaultValue={dialog.item?.verificationStatus||"official-directory"}><option value="official-directory">دليل رسمي</option><option value="pending-review">قيد المراجعة</option></SearchableSelect>
</label><span /></div><label>رابط شعار HTTPS<input name="logoUrl" defaultValue={dialog.item?.logo?.startsWith("http")?dialog.item.logo:""} dir="ltr"/></label><label className="live-file"><Upload size={18}/><span>أو ارفع ملف شعار شفاف</span><input name="logoFile" type="file" accept="image/png,image/jpeg,image/webp"/></label><label>الحالة
<SearchableSelect name="status" defaultValue={dialog.item?.status||"published"}><option value="published">منشور</option><option value="hidden">مخفي</option></SearchableSelect>
</label><label className="live-check"><input name="featured" type="checkbox" defaultChecked={dialog.item?.featured}/> إظهار في الصفحة الرئيسية</label></>}{dialog.kind==="specialty"&&<><label>المعرّف (يدوي أو تلقائي عند الإضافة)<input name="slug" readOnly={Boolean(dialog.item)} placeholder="اختياري: اتركه فارغًا للتوليد التلقائي" defaultValue={dialog.item?.slug} pattern="[A-Za-z0-9._-]{2,80}" dir="ltr"/></label><label>اسم التخصص<input name="name" required defaultValue={dialog.item?.name}/></label><label>الوصف<textarea name="description" defaultValue={dialog.item?.description}/></label><label>رابط المصدر الرسمي<input name="sourceUrl" defaultValue={dialog.item?.sourceUrl} dir="ltr" placeholder="https://..."/></label><div className="two-fields"><label>الكلية/القسم<input name="faculty" defaultValue={dialog.item?.faculty||""}/></label><label>الدرجة<input name="degree" defaultValue={dialog.item?.degree||""}/></label></div><label>تاريخ التحقق<input name="verifiedAt" defaultValue={dialog.item?.verifiedAt||""} dir="ltr" placeholder="2026-08-27"/></label><div className="two-fields"><label>حالة التحقق
<SearchableSelect name="verificationStatus" defaultValue={dialog.item?.verificationStatus||"pending-review"}><option value="official-program">برنامج رسمي</option><option value="pending-review">قيد المراجعة</option><option value="discovery">اكتشافي</option></SearchableSelect>
</label><span /></div><label>ربطه بجهة
<SearchableSelect name="institutionSlug"><option value="">بدون ربط جديد</option>{data.institutions.map((row)=><option value={row.slug} key={row.slug}>{row.name}</option>)}</SearchableSelect>
</label><label>الحالة
<SearchableSelect name="status" defaultValue={dialog.item?.status||"published"}><option value="published">منشور</option><option value="hidden">مخفي</option></SearchableSelect>
</label></>}{dialog.kind==="course"&&<><label>المعرّف (يدوي أو تلقائي عند الإضافة)<input name="slug" readOnly={Boolean(dialog.item)} placeholder="اختياري: اتركه فارغًا للتوليد التلقائي" defaultValue={dialog.item?.slug} pattern="[A-Za-z0-9._-]{2,80}" dir="ltr"/></label><label>العنوان<input name="title" required defaultValue={dialog.item?.title}/></label><div className="two-fields"><label>العنوان الإنجليزي<input name="titleEn" defaultValue={dialog.item?.titleEn} dir="ltr"/></label><label>رمز المادة<input name="code" defaultValue={dialog.item?.code} dir="ltr"/></label></div><label>الوصف<textarea name="description" defaultValue={dialog.item?.description||"شرح جامعي منظم مع درس تجريبي قبل الاشتراك."}/></label><label>رابط صورة الغلاف HTTPS<input name="coverImageUrl" defaultValue={dialog.item?.coverImage||""} dir="ltr" placeholder="https://..."/></label><label className="live-file"><Upload size={18}/><span>أو ارفع صورة الغلاف</span><input name="coverFile" type="file" accept="image/png,image/jpeg,image/webp"/></label><label>الجامعة
<SearchableSelect name="institutionSlug" required defaultValue={dialog.item?.universitySlug}><option value="">اختر</option>{data.institutions.map((row)=><option value={row.slug} key={row.slug}>{row.name}</option>)}</SearchableSelect>
</label><label>التخصص الإداري
<SearchableSelect name="specialtySlug" required defaultValue={dialog.item?.specialtySlug||""}><option value="">اختر تخصصًا أضفته في الإدارة</option>{data.specialties.map((row)=><option value={row.slug} key={row.slug}>{row.name}</option>)}</SearchableSelect>
</label><label>نطاق ظهور المادة
<SearchableSelect name="audienceScope" defaultValue={dialog.item?.audienceScope||"specialty"}><option value="specialty">التخصص المحدد فقط</option><option value="institution">جميع تخصصات الجامعة</option></SearchableSelect>
<small>اختيار الجامعة يجعل المادة مشتركة لكل تخصصاتها مع بقاء التخصص الإداري للتصنيف.</small></label><div className="two-fields"><label>السعر<input name="price" type="number" min="0" required defaultValue={dialog.item?.price||0}/></label><label>السعر السابق<input name="oldPrice" type="number" min="0" defaultValue={dialog.item?.oldPrice}/></label></div><label>مدة الوصول<input name="accessLabel" defaultValue={dialog.item?.access||"90 يومًا"}/></label><label>رابط الخطة/المصدر الرسمي<input name="sourceUrl" defaultValue={dialog.item?.sourceUrl||""} dir="ltr" placeholder="https://..."/></label><label>تاريخ التحقق<input name="verifiedAt" defaultValue={dialog.item?.verifiedAt||""} dir="ltr" placeholder="2026-08-27"/></label><div className="two-fields"><label>الحالة
<SearchableSelect name="status" defaultValue={dialog.item?.status||"draft"}><option value="draft">مسودة</option><option value="published">منشور</option><option value="hidden">مخفي</option></SearchableSelect>
</label><label>النمط
<SearchableSelect name="coverTheme" defaultValue={dialog.item?.coverTheme||"blue-violet"}><option value="blue-violet">أزرق بنفسجي</option><option value="emerald-blue">زمردي أزرق</option><option value="orange-red">برتقالي أحمر</option><option value="indigo-cyan">نيلي سماوي</option></SearchableSelect>
</label></div><label className="live-check"><input name="featured" type="checkbox" defaultChecked={dialog.item?.featured}/> مادة مميزة</label></>}{dialog.kind==="staff"&&<><label>البريد الإلكتروني<input name="email" type="email" required dir="ltr"/></label><label>الاسم الكامل<input name="fullName" required minLength={5}/></label><label>الجوال السعودي<input name="phone" required placeholder="05xxxxxxxx" dir="ltr"/></label><label>كلمة المرور المؤقتة<input name="password" type="password" required minLength={10} autoComplete="new-password"/></label><div className="two-fields"><label>الدور
<SearchableSelect name="role" defaultValue="supervisor"><option value="supervisor">مشرف</option><option value="admin">مدير إدارة</option></SearchableSelect>
</label><label>الجامعة
<SearchableSelect name="universitySlug" required><option value="">اختر الجامعة</option>{data.institutions.map((row)=><option value={row.slug} key={row.slug}>{row.name}</option>)}</SearchableSelect>
</label></div><label>التخصص
<SearchableSelect name="specialty" required><option value="">اختر التخصص</option>{data.specialties.map((row)=><option value={row.name} key={row.slug}>{row.name}</option>)}</SearchableSelect>
</label></>}{dialog.kind==="access"&&<><label>المادة
<SearchableSelect name="courseSlug" required><option value="">اختر</option>{data.courses.map((course)=><option value={course.slug} key={course.slug}>{course.title} — {course.university} · {course.price} ر.س</option>)}</SearchableSelect>
</label><label>نوع المنح
<SearchableSelect name="grantType" defaultValue="manual_payment"><option value="manual_payment">دفعة يدوية مسجلة</option><option value="complimentary">منحة مجانية</option></SearchableSelect>
</label><label>السعر المسجل للعملية<input name="price" type="number" min="0" step="0.01" defaultValue="0" required/><small>يُسجّل طلب مدفوع عند اختيار دفعة يدوية، ولا تدخل المنحة المجانية في الإيرادات.</small></label><label>انتهاء الصلاحية (اختياري)<input name="expiresAt" type="datetime-local"/></label></>}{error&&<p className="form-error">{error}</p>}<footer><button type="button" className="button button-ghost" onClick={close}>إلغاء</button><button className="button button-primary" disabled={busy}>{busy?"جارٍ الحفظ...":"حفظ"}</button></footer></form></div>}

function AdminConfirmDialog({request,close,mutate}:{request:DeleteRequest;close:()=>void;mutate:(p:Record<string,unknown>,s?:string)=>Promise<boolean>}){const[confirmation,setConfirmation]=useState("");const[busy,setBusy]=useState(false);const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();if(confirmation.trim()!=="حذف")return;setBusy(true);const ok=await mutate({action:"deleteEntity",entityType:request.entityType,entityId:request.entityId,confirmation:confirmation.trim()},"تم الحذف النهائي وتحديث البيانات");if(ok)close();else setBusy(false);};return <div className="admin-modal-overlay" role="presentation"><div className="admin-modal live-modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title"><div><span className="danger-icon"><X size={19}/></span><div><h2 id="delete-dialog-title">تأكيد الحذف النهائي</h2><p>أنت على وشك حذف «{request.label}» نهائيًا.</p></div><button type="button" onClick={close} aria-label="إلغاء الحذف" disabled={busy}><X size={19}/></button></div><div className="delete-warning"><strong>هذا الإجراء لا يمكن التراجع عنه.</strong><p>{request.impact}</p><p>تبقى سجلات التدقيق محفوظة، وتحمي المنصة الطلبات والفواتير وأحداث الدفع من الحذف.</p></div><form onSubmit={submit}><label>اكتب كلمة <strong>حذف</strong> للتأكيد<input value={confirmation} onChange={(event)=>setConfirmation(event.target.value)} autoComplete="off" autoFocus/></label><footer><button type="button" className="button button-ghost" onClick={close} disabled={busy}>إلغاء</button><button className="button danger-button" disabled={busy||confirmation.trim()!=="حذف"}>{busy?"جارٍ الحذف...":"تأكيد الحذف النهائي"}</button></footer></form></div></div>}
