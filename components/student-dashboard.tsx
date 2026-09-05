"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, BookOpen, Bot, CheckCircle2, FileUp, Gift, Heart, KeyRound, Laptop, LayoutDashboard, LifeBuoy, LoaderCircle, LogOut, Paperclip, Play, Receipt, RefreshCw, Settings, ShoppingCart, Smartphone, Sparkles, Trash2, TrendingUp, UserRound } from "lucide-react";
import type { Institution } from "@/lib/data";
import { ACADEMIC_LEVELS } from "@/lib/academic-levels";
import { useAcademicPrograms } from "@/components/use-academic-programs";
import { AppearanceSettings } from "@/components/theme-provider";
import { useRealtimeSync } from "@/components/realtime-sync";
import { signOutWeb } from "@/components/web-logout";

export type DashboardUser = { id:number; fullName:string; email:string; phone:string; universitySlug:string; specialty:string; academicLevel?:string };
export type DashboardCourse = { slug:string; title:string; university:string; color:string; icon:string; progress:number; current:string; remaining:string; accessState:"active"|"expired"|"suspended"; expiresAt?:string|null };
export type DashboardOrder = { orderNumber:string; courseTitle:string; total:number; currency:string; status:string; createdAt:string; refundStatus?:string|null };
export type DashboardRequest = { id:number; courseName:string; status:string; attachmentsCount:number; createdAt:string; preparedCourseSlug?:string|null; preparedCourseTitle?:string|null; notes?:string };
type RequestFile = { id:number; originalName:string; contentType:string; sizeBytes:number; scanStatus?:string|null; createdAt:string };
type PaymentStatus = { orderNumber:string; status:string; phase:"paid"|"review"|"failed"|"refunded"|"pending"; total:number; currency:string; checkoutUrl?:string|null; courses:Array<{slug:string;title:string}> };
type SessionRow = { id:number; deviceLabel:string; platform:string; ipAddress?:string|null; lastSeenAt:string; createdAt:string; current:boolean };
export type DashboardNotice = { id:number; title:string; body:string; actionUrl:string | null; actionLabel?:string | null; presentation?:string; template?:string; createdAt:string; read:boolean };
export type DashboardRecommendation = { slug:string; title:string; university:string; specialty:string; price:number; color:string; icon:string; match:"تخصصك"|"جامعتك"|"تخصص مشابه" };
export type DashboardTicket = { id:number;ticketNumber:string;title:string;category:string;status:string;createdAt:string;replies:Array<{id:number;body:string;createdAt:string}> };

const nav = [
  { id:"overview", label:"نظرة عامة", icon:LayoutDashboard },
  { id:"courses", label:"موادي", icon:BookOpen },
  { id:"requests", label:"طلبات المواد", icon:FileUp },
  { id:"orders", label:"الطلبات والفواتير", icon:Receipt },
  { id:"notifications", label:"الإشعارات", icon:Bell },
  { id:"support", label:"الدعم", icon:LifeBuoy },
  { id:"account", label:"حسابي", icon:Settings },
];
const serviceLinks = [
  { href:"/referrals", label:"الإحالات والهدايا", icon:Gift },
  { href:"/study-tools", label:"أدوات مراس", icon:Bot },
  { href:"/favorites", label:"المفضلة", icon:Heart },
  { href:"/cart", label:"السلة", icon:ShoppingCart },
];

export function StudentDashboard({ initialView = "overview", returnOrder = "", notice = "", user, owned, expired, orders, requests, notices, tickets, institutions, recommended }: { initialView?:string; returnOrder?:string; notice?:string; user:DashboardUser; owned:DashboardCourse[]; expired:DashboardCourse[]; orders:DashboardOrder[]; requests:DashboardRequest[]; notices:DashboardNotice[]; tickets:DashboardTicket[]; institutions:Institution[]; recommended:DashboardRecommendation[] }) {
  const [active, setActive] = useState(initialView);
  const [dismissedNotice, setDismissedNotice] = useState(false);
  const [live, setLive] = useState({ user, owned, expired, orders, requests, notices, tickets, institutions, recommended });
  const [noticeRows, setNoticeRows] = useState(notices);
  const notificationRevisionRef = useRef(0);
  const pendingReadIdsRef = useRef(new Set<number>());
  const refresh = useCallback(async () => {
    const notificationRevision = notificationRevisionRef.current;
    try {
      const response = await fetch("/api/mobile/dashboard", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as Partial<typeof live> & { user?: DashboardUser; owned?: DashboardCourse[]; expired?: DashboardCourse[]; orders?: DashboardOrder[]; requests?: DashboardRequest[]; notifications?: Array<DashboardNotice & { readAt?: string | null }>; tickets?: DashboardTicket[]; institutions?: Institution[]; recommended?: DashboardRecommendation[] };
      const nextNotices = payload.notifications?.map((item) => ({ ...item, read: typeof item.read === "boolean" ? item.read : Boolean(item.readAt) }));
      const notificationsAreCurrent = notificationRevision === notificationRevisionRef.current && pendingReadIdsRef.current.size === 0;
      if (nextNotices && notificationsAreCurrent) setNoticeRows(nextNotices);
      setLive((current) => ({ user: payload.user || current.user, owned: payload.owned || current.owned, expired: payload.expired || current.expired, orders: payload.orders || current.orders, requests: payload.requests || current.requests, notices: nextNotices && notificationsAreCurrent ? nextNotices : current.notices, tickets: payload.tickets || current.tickets, institutions: payload.institutions || current.institutions, recommended: payload.recommended || current.recommended }));
    } catch { /* Keep the last known snapshot when the network is temporarily unavailable. */ }
  }, []);
  useRealtimeSync((payload) => {
    if (!payload.changed || payload.changed.some((channel) => ["account", "commerce", "support", "notifications", "requests", "catalog", "settings"].includes(channel))) void refresh();
  });
  const unread = noticeRows.filter((item) => !item.read).length;
  useEffect(() => {
    if (active !== "notifications") return;
    const notificationRevision = notificationRevisionRef.current;
    const controller = new AbortController();
    fetch("/api/mobile/notifications", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { notifications?: Array<{ id: number; title: string; body: string; actionUrl: string | null; actionLabel?: string | null; presentation?: string; template?: string; createdAt: string; readAt: string | null }> } : null)
      .then((payload) => {
        if (!payload || controller.signal.aborted || notificationRevision !== notificationRevisionRef.current || pendingReadIdsRef.current.size > 0) return;
        const rows = (payload.notifications || []).map((item) => ({ ...item, read: Boolean(item.readAt) }));
        setNoticeRows(rows);
        window.dispatchEvent(new CustomEvent("meras:notifications-read", { detail: { unread: rows.filter((item) => !item.read).length } }));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [active]);
  const institution = live.institutions.find((item) => item.slug === live.user.universitySlug);
  let content: React.ReactNode;
  if (active === "overview") content = <Overview user={live.user} owned={live.owned} requests={live.requests} recommended={live.recommended} setActive={setActive} />;
  else if (active === "courses") content = <MyCourses owned={live.owned} expired={live.expired} />;
  else if (active === "requests") content = <Requests rows={live.requests} />;
  else if (active === "orders") content = <Orders rows={live.orders} returnOrder={returnOrder} onPaid={refresh} />;
  else if (active === "notifications") content = <Notifications
    rows={noticeRows}
    onRead={async (id) => {
      const wasUnread = noticeRows.some((item) => item.id === id && !item.read);
      if (!wasUnread) return;
      notificationRevisionRef.current += 1;
      pendingReadIdsRef.current.add(id);
      setNoticeRows((rows) => {
        const next = rows.map((item) => item.id === id ? { ...item, read: true } : item);
        window.dispatchEvent(new CustomEvent("meras:notifications-read", { detail: { unread: next.filter((item) => !item.read).length } }));
        return next;
      });
      let definitiveFailure = false;
      try {
        const response = await fetch("/api/mobile/notifications", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
        if (!response.ok) {
          definitiveFailure = response.status >= 400 && response.status < 500;
          throw new Error("notification_read_failed");
        }
      } catch {
        if (definitiveFailure) {
          setNoticeRows((rows) => {
            const next = rows.map((item) => item.id === id ? { ...item, read: false } : item);
            window.dispatchEvent(new CustomEvent("meras:notifications-read", { detail: { unread: next.filter((item) => !item.read).length } }));
            return next;
          });
        }
      } finally {
        pendingReadIdsRef.current.delete(id);
        notificationRevisionRef.current += 1;
        if (pendingReadIdsRef.current.size === 0) void refresh();
      }
    }}
    onReadAll={async () => {
      const unreadIds = new Set(noticeRows.filter((item) => !item.read).map((item) => item.id));
      if (!unreadIds.size) return;
      notificationRevisionRef.current += 1;
      unreadIds.forEach((id) => pendingReadIdsRef.current.add(id));
      setNoticeRows((rows) => rows.map((item) => unreadIds.has(item.id) ? { ...item, read: true } : item));
      window.dispatchEvent(new CustomEvent("meras:notifications-read", { detail: { unread: 0 } }));
      let definitiveFailure = false;
      try {
        const response = await fetch("/api/mobile/notifications", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) });
        if (!response.ok) {
          definitiveFailure = response.status >= 400 && response.status < 500;
          throw new Error("notifications_read_failed");
        }
      } catch {
        if (definitiveFailure) {
          setNoticeRows((rows) => {
            const next = rows.map((item) => unreadIds.has(item.id) ? { ...item, read: false } : item);
            window.dispatchEvent(new CustomEvent("meras:notifications-read", { detail: { unread: next.filter((item) => !item.read).length } }));
            return next;
          });
        }
      } finally {
        unreadIds.forEach((id) => pendingReadIdsRef.current.delete(id));
        notificationRevisionRef.current += 1;
        if (pendingReadIdsRef.current.size === 0) void refresh();
      }
    }}
  />;
  else if (active === "support") content = <Support rows={live.tickets} />;
  else content = <Account user={live.user} institutions={live.institutions} />;
  const logout = () => { void signOutWeb("/"); };
  return <div className="student-app"><aside className="student-sidebar"><div className="student-profile-mini"><div>{live.user.fullName[0]}</div><span><strong>{live.user.fullName}</strong><small>{institution?.name || "مراس العلم"}</small></span></div><nav>{nav.map((item) => { const Icon=item.icon; return <button key={item.id} className={active===item.id?"active":""} onClick={() => setActive(item.id)}><Icon size={18} />{item.label}{item.id==="notifications"&&unread>0&&<i>{unread}</i>}</button>; })}<span className="student-nav-group">خدمات</span>{serviceLinks.map((item)=>{const Icon=item.icon;return <Link key={item.href} href={item.href}><Icon size={18} />{item.label}</Link>;})}</nav><div className="student-sidebar-help"><LifeBuoy size={21} /><strong>تحتاج مساعدة؟</strong><small>فريق مراس معك</small><button onClick={() => setActive("support")}>تواصل معنا</button></div><button className="student-logout" onClick={logout}><LogOut size={17} /> تسجيل الخروج</button></aside><div className="student-content"><div className="student-mobile-tabs">{nav.slice(0,5).map((item)=>{const Icon=item.icon;return <button key={item.id} onClick={()=>setActive(item.id)} className={active===item.id?"active":""}><Icon size={18}/><span>{item.label}</span></button>;})}</div>{notice&&!dismissedNotice&&<div className="dashboard-inline-notice" role="status"><span>{notice}</span><button type="button" onClick={()=>setDismissedNotice(true)} aria-label="إخفاء">×</button></div>}{content}</div></div>;
}

function DashboardTitle({ eyebrow,title,description,action }: {eyebrow?:string;title:string;description?:string;action?:React.ReactNode}) { return <div className="dashboard-title"><div>{eyebrow&&<span>{eyebrow}</span>}<h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>; }

function Overview({ user, owned, requests, recommended, setActive }:{user:DashboardUser;owned:DashboardCourse[];requests:DashboardRequest[];recommended:DashboardRecommendation[];setActive:(id:string)=>void}) {
  const average = owned.length ? Math.round(owned.reduce((sum,item)=>sum+item.progress,0)/owned.length) : 0;
  const first = owned[0];
  return <><DashboardTitle eyebrow={`مرحبًا، ${user.fullName.split(" ")[0]} 👋`} title={first ? "كمّل من حيث توقفت" : "ملفك الدراسي جاهز"} description={first ? `لديك ${owned.length} مواد نشطة، وتقدمك محفوظ على جميع أجهزتك.` : "ابدأ باستكشاف المواد، أو اطلب مادتك إذا لم تجدها."} action={<Link href="/courses" className="button button-primary">استكشف المواد <Sparkles size={16}/></Link>} />
    <div className="dashboard-stat-grid"><article><i><BookOpen size={20}/></i><span><small>المواد النشطة</small><strong>{owned.length}</strong><em>مرتبطة بمشترياتك</em></span></article><article><i><FileUp size={20}/></i><span><small>طلبات المواد</small><strong>{requests.length}</strong><em>يمكن متابعتها هنا</em></span></article><article><i><CheckCircle2 size={20}/></i><span><small>متوسط التقدم</small><strong>{average}%</strong><em>محفوظ تلقائيًا</em></span></article><article><i><TrendingUp size={20}/></i><span><small>حالة الحساب</small><strong>مكتمل</strong><em>جاهز للشراء</em></span></article></div>
    {first ? <div className="continue-card"><div className={`continue-art bg-gradient-to-br ${first.color}`}><span className="course-cover-grid"/><strong>{first.icon}</strong><i><Play size={22} fill="currentColor"/></i></div><div className="continue-info"><span>تابع الآن</span><h2>{first.title}</h2><p>{first.current}</p><div className="continue-progress"><i style={{width:`${first.progress}%`}}/></div><small><b>{first.progress}% مكتمل</b><em>{first.remaining}</em></small></div><Link href={`/learn/${first.slug}`} className="button button-primary">متابعة الدرس <ArrowLeft size={16}/></Link></div> : <section className="dashboard-panel dashboard-empty-state"><i><BookOpen size={31}/></i><h2>لا توجد مواد مفعّلة بعد</h2><p>جرّب الدرس المجاني قبل الشراء، أو أرسل طلب مادة مع السلايدات ليصل مباشرة إلى فريق المحتوى.</p><div><Link href="/courses" className="button button-primary">تصفح المواد</Link><Link href="/request-course" className="button button-soft">طلب مادة ورفع الملفات</Link></div></section>}
    <div className="dashboard-two-columns"><section className="dashboard-panel"><div className="panel-head"><div><h2>موادك</h2><p>صلاحيات الوصول الفعلية</p></div><button onClick={()=>setActive("courses")}>عرض الكل <ArrowLeft size={14}/></button></div><div className="mini-course-list">{owned.slice(0,3).map((course)=><Link key={course.slug} href={`/learn/${course.slug}`}><div className={`bg-gradient-to-br ${course.color}`}>{course.icon}</div><span><strong>{course.title}</strong><small>{course.current}</small><i><b style={{width:`${course.progress}%`}}/></i></span><em>{course.progress}%</em></Link>)}{owned.length===0&&<p className="panel-empty-copy">ستظهر المواد هنا فور تأكيد الدفع من الخادم.</p>}</div></section><section className="dashboard-panel request-shortcut"><FileUp size={30}/><h2>مادتك غير موجودة؟</h2><p>ارفع اسم المادة والسلايدات أو توصيف المقرر، وسيتابع المشرف حالة الطلب معك. نتابع طلب المادة ونحدّث حالته من حسابك.</p><Link href="/request-course" className="button button-soft">إنشاء طلب جديد</Link></section></div>
    <div className="dashboard-services-grid">{serviceLinks.map((item)=>{const Icon=item.icon;return <Link key={item.href} href={item.href} className="dashboard-service-card"><i><Icon size={19}/></i><span><strong>{item.label}</strong><small>{item.href==="/referrals"?"شارك رابطك واكسب كوبونات واشتراكات":item.href==="/study-tools"?"تلخيص وترجمة واختبارات تفاعلية":item.href==="/favorites"?"المواد التي حفظتها للرجوع إليها":"أكمل الشراء وطبّق كوبوناتك"}</small></span><ArrowLeft size={15}/></Link>;})}</div>
    <section className="dashboard-panel dashboard-recommendations"><div className="panel-head"><div><h2>مقترحة لجامعتك وتخصصك</h2><p>نرتب المطابق أولًا، ويمكنك استكشاف بقية الجامعات والتخصصات وشراء موادها أيضًا.</p></div><Link href="/courses">كل الجامعات <ArrowLeft size={14}/></Link></div>{recommended.length?<div>{recommended.map((course)=><Link href={`/courses/${course.slug}`} key={course.slug}><i className={`bg-gradient-to-br ${course.color}`}>{course.icon}</i><span><em>{course.match}</em><strong>{course.title}</strong><small>{course.university} · {course.specialty}</small></span><b>{course.price} ر.س <ArrowLeft size={14}/></b></Link>)}</div>:<p className="panel-empty-copy">لا توجد مادة منشورة مطابقة بعد. استخدم طلب مادة وارفع التوصيف ليصل إلى المشرف.</p>}</section>
  </>;
}

function MyCourses({owned,expired}:{owned:DashboardCourse[];expired:DashboardCourse[]}) {
  const [filter,setFilter]=useState("الكل");
  const all=[...owned,...expired];
  const rows=filter==="مكتملة"?owned.filter((course)=>course.progress>=90):filter==="قيد التعلم"?owned.filter((course)=>course.progress<90):filter==="منتهية"?expired:all;
  return <><DashboardTitle title="موادي" description="تظهر موادك النشطة والمنتهية مع بقاء التقدم والملاحظات محفوظة عند التجديد." action={<Link href="/courses" className="button button-primary">استكشف مواد جديدة</Link>}/><div className="dashboard-tabs">{["الكل","قيد التعلم","مكتملة","منتهية"].map((item)=><button key={item} className={filter===item?"active":""} onClick={()=>setFilter(item)}>{item}{item==="منتهية"&&expired.length?` (${expired.length})`:""}</button>)}</div>{rows.length?<div className="owned-courses-grid">{rows.map((course)=>{const unavailable=course.accessState!=="active";return <article key={course.slug} className={unavailable?"course-access-inactive":""}><div className={`owned-course-art bg-gradient-to-br ${course.color}`}><span className="course-cover-grid"/><strong>{course.icon}</strong><em>{unavailable?(course.accessState==="suspended"?"موقوفة":"منتهية"):`${course.progress}%`}</em></div><div><small>{course.university}</small><h3>{course.title}</h3><p>{unavailable?"تقدمك وملاحظاتك محفوظة ويمكنك استعادتها بالتجديد.":`آخر درس: ${course.current}`}</p><div className="owned-progress"><i style={{width:`${course.progress}%`}}/></div><span><b>{course.progress}% مكتمل</b><em>{course.remaining}</em></span>{unavailable?<Link href={`/checkout/${course.slug}`} data-analytics-event="renewal_start" data-course-slug={course.slug} className="button button-primary">تجديد الوصول <ArrowLeft size={15}/></Link>:<Link href={`/learn/${course.slug}`} className="button button-soft">متابعة التعلم <ArrowLeft size={15}/></Link>}</div></article>;})}</div>:<EmptyPanel title="لا توجد مواد في هذا التصنيف" text="استكشف الفهرس أو اطلب مادة غير متوفرة."/>}</>;
}

function Requests({rows}:{rows:DashboardRequest[]}) {
  const [files,setFiles]=useState<Record<number,RequestFile[]|"loading"|"error">>({});
  const loadFiles=async(id:number)=>{ if(files[id]&&files[id]!=="error")return; setFiles((current)=>({...current,[id]:"loading"})); try{ const response=await fetch(`/api/course-requests/${id}/files`,{credentials:"same-origin",cache:"no-store"}); const data=await response.json() as {files?:RequestFile[];error?:string}; if(!response.ok)throw new Error(data.error||"تعذر تحميل الملفات"); setFiles((current)=>({...current,[id]:data.files||[]})); }catch{ setFiles((current)=>({...current,[id]:"error"})); } };
  return <><DashboardTitle title="طلبات المواد" description="طلباتك مرتبطة بملفك وتصل إلى المشرف مع المرفقات، وتتحول إلى مادة جاهزة عند اكتمال التجهيز." action={<Link href="/request-course" className="button button-primary"><FileUp size={16}/> طلب مادة</Link>}/>{rows.length?<section className="dashboard-panel request-history">{rows.map((row)=><article key={row.id}><i><FileUp size={18}/></i><span><strong>{row.courseName}</strong><small>#{row.id} · {new Date(row.createdAt).toLocaleDateString("ar-SA")} · {row.attachmentsCount} مرفقات</small>{row.notes?<small>{row.notes.slice(0,140)}</small>:null}{row.status==="available"&&row.preparedCourseSlug?<Link className="request-prepared-link" href={`/courses/${row.preparedCourseSlug}`}>المادة جاهزة: {row.preparedCourseTitle||row.preparedCourseSlug} <ArrowLeft size={13}/></Link>:null}{row.attachmentsCount>0&&<details className="request-files-details" onToggle={(event)=>{if((event.currentTarget as HTMLDetailsElement).open)void loadFiles(row.id);}}><summary><Paperclip size={13}/> ملفاتي المرفوعة</summary>{files[row.id]==="loading"?<small>جارٍ تحميل الملفات...</small>:files[row.id]==="error"?<small>تعذر تحميل الملفات.</small>:Array.isArray(files[row.id])?(files[row.id] as RequestFile[]).length?<ul>{(files[row.id] as RequestFile[]).map((file)=><li key={file.id}>{file.scanStatus&&file.scanStatus!=="clean"?<span title={file.scanStatus==="pending"?"قيد الفحص":"محجوز"}>{file.originalName} · {(file.sizeBytes/1024/1024).toFixed(1)} MB · {file.scanStatus==="pending"?"قيد الفحص":"غير متاح"}</span>:<a href={`/api/course-requests/files/${file.id}`}>{file.originalName} · {(file.sizeBytes/1024/1024).toFixed(1)} MB</a>}</li>)}</ul>:<small>لا توجد ملفات محفوظة.</small>:null}</details>}</span><em className={`request-status status-${row.status}`}>{statusLabel(row.status)}</em></article>)}</section>:<EmptyPanel title="لم ترسل طلبات بعد" text="إذا لم تجد المادة، ارفع السلايدات أو التوصيف وسنبدأ تتبعها."/>}</>; }

function paymentPhaseCopy(status:PaymentStatus){ if(status.phase==="paid")return {title:"تم تأكيد الدفع وتفعيل المواد",text:"أصبحت المواد متاحة في مساحة التعلم الخاصة بك، وستجد الفاتورة في السجل أدناه.",tone:"success"}; if(status.phase==="review")return {title:"استلمنا دفعتك ونتحقق منها",text:"لن تحتاج إلى أي إجراء؛ سيُفعّل المحتوى تلقائيًا أو يتواصل معك فريق مراس بعد المراجعة.",tone:"warning"}; if(status.phase==="failed")return {title:"لم تكتمل عملية الدفع",text:"لم يُخصم أي مبلغ. يمكنك إعادة المحاولة من السلة أو اختيار وسيلة دفع أخرى.",tone:"danger"}; if(status.phase==="refunded")return {title:"تم استرداد هذا الطلب",text:"أُوقف الوصول المرتبط بالطلب وأُعيد المبلغ حسب سياسة الاسترداد.",tone:"warning"}; return {title:"بانتظار تأكيد بوابة الدفع",text:"نتابع حالة العملية مع Tap لحظيًا؛ عادةً يستغرق التأكيد أقل من دقيقة.",tone:"info"}; }
function PaymentReturnCard({orderNumber,onPaid}:{orderNumber:string;onPaid:()=>void|Promise<void>}) {
  const [status,setStatus]=useState<PaymentStatus|null>(null); const [error,setError]=useState(""); const [attempt,setAttempt]=useState(0); const notified=useRef(false);
  useEffect(()=>{ let cancelled=false; let timer:number|null=null; const poll=async(round:number)=>{ try{ const response=await fetch(`/api/checkout?order=${encodeURIComponent(orderNumber)}`,{credentials:"same-origin",cache:"no-store"}); const data=await response.json() as PaymentStatus&{error?:string}; if(cancelled)return; if(!response.ok)throw new Error(data.error||"تعذر التحقق من حالة الطلب"); setStatus(data); setError(""); if(data.phase==="paid"&&!notified.current){notified.current=true;void onPaid();} if(data.phase==="pending"&&round<8)timer=window.setTimeout(()=>void poll(round+1),3000); }catch(caught){ if(cancelled)return; setError(caught instanceof Error?caught.message:"تعذر التحقق من حالة الطلب"); if(round<3)timer=window.setTimeout(()=>void poll(round+1),4000); } }; timer=window.setTimeout(()=>void poll(0),0); return()=>{cancelled=true;if(timer!==null)window.clearTimeout(timer);}; },[orderNumber,attempt,onPaid]);
  if(!status&&!error)return <section className="dashboard-panel payment-return-card tone-info"><LoaderCircle size={22} className="spin"/><div><h2>نتحقق من حالة طلبك</h2><p>رقم الطلب <bdi dir="ltr">{orderNumber}</bdi> — لحظات ونؤكد نتيجة الدفع.</p></div></section>;
  if(!status)return <section className="dashboard-panel payment-return-card tone-danger"><Receipt size={22}/><div><h2>تعذر التحقق من الطلب</h2><p>{error}</p></div><button type="button" className="button button-soft" onClick={()=>setAttempt((value)=>value+1)}><RefreshCw size={15}/> إعادة المحاولة</button></section>;
  const copy=paymentPhaseCopy(status);
  return <section className={`dashboard-panel payment-return-card tone-${copy.tone}`}>{status.phase==="pending"?<LoaderCircle size={22} className="spin"/>:status.phase==="paid"?<CheckCircle2 size={22}/>:<Receipt size={22}/>}<div><h2>{copy.title}</h2><p>{copy.text}</p><small>رقم الطلب <bdi dir="ltr">{status.orderNumber}</bdi> · {status.total} {status.currency} · {status.courses.map((course)=>course.title).join("، ")}</small></div><div className="payment-return-actions">{status.phase==="paid"&&status.courses.slice(0,3).map((course)=><Link key={course.slug} href={`/learn/${course.slug}`} className="button button-primary">ابدأ {course.title} <ArrowLeft size={14}/></Link>)}{status.phase==="paid"&&<Link href={`/invoices/${encodeURIComponent(status.orderNumber)}`} className="button button-soft">الفاتورة</Link>}{status.phase==="failed"&&<Link href="/cart" className="button button-primary">إعادة المحاولة من السلة</Link>}{status.phase==="pending"&&status.checkoutUrl&&<a href={status.checkoutUrl} className="button button-soft">إتمام الدفع</a>}{status.phase==="review"&&<Link href={`/support?category=payment&order=${encodeURIComponent(status.orderNumber)}`} className="button button-soft">تواصل مع الدعم</Link>}</div></section>;
}
function Orders({rows,returnOrder,onPaid}:{rows:DashboardOrder[];returnOrder?:string;onPaid:()=>void|Promise<void>}) { return <><DashboardTitle title="الطلبات والفواتير" description="سجل عمليات الدفع الفعلية المرتبطة بحسابك."/>{returnOrder?<PaymentReturnCard orderNumber={returnOrder} onPaid={onPaid}/>:null}{rows.length?<div className="dashboard-panel table-panel"><div className="orders-table"><div className="table-row table-head"><span>رقم الطلب</span><span>المادة</span><span>التاريخ</span><span>المبلغ</span><span>الحالة</span><span>الفاتورة</span></div>{rows.map(row=><div className="table-row" key={row.orderNumber}><span dir="ltr">#{row.orderNumber}</span><strong>{row.courseTitle}</strong><span>{new Date(row.createdAt).toLocaleDateString("ar-SA")}</span><span>{row.total} {row.currency}</span><em>{statusLabel(row.status)}{row.refundStatus?<small className="order-refund-status">استرداد: {refundStatusLabel(row.refundStatus)}</small>:null}</em><span>{["paid","partially_refunded","refunded"].includes(row.status)?<><Link href={`/invoices/${encodeURIComponent(row.orderNumber)}`}>فتح / PDF</Link>{["paid","partially_refunded"].includes(row.status)&&!row.refundStatus?<Link className="order-refund-link" href={`/support?category=payment&order=${encodeURIComponent(row.orderNumber)}`}>طلب استرداد</Link>:null}</>:["verification_pending","payment_review"].includes(row.status)?<small>بانتظار التأكيد</small>:"—"}</span></div>)}</div></div>:<EmptyPanel title="لا توجد عمليات شراء" text="لن تُفعّل أي مادة إلا بعد تأكيد الدفع من Tap على الخادم."/>}</>; }

function Notifications({rows,onRead,onReadAll}:{rows:DashboardNotice[];onRead:(id:number)=>void|Promise<void>;onReadAll:()=>void|Promise<void>}) {
  const unread = rows.filter((item)=>!item.read).length;
  const [filter,setFilter]=useState<"all"|"unread">("all");
  const visible=useMemo(()=>filter==="unread"?rows.filter((item)=>!item.read):rows,[filter,rows]);
  const grouped=useMemo(()=>{const result=new Map<string,DashboardNotice[]>();for(const item of visible){const date=new Date(item.createdAt);const key=Number.isNaN(date.getTime())?"تحديثات سابقة":date.toLocaleDateString("ar-SA",{weekday:"long",day:"numeric",month:"long"});result.set(key,[...(result.get(key)||[]),item]);}return [...result.entries()];},[visible]);
  const noticeIcon=(item:DashboardNotice)=>item.template==="discount"?<Sparkles size={19}/>:item.template==="new-course"?<BookOpen size={19}/>:item.template==="success"?<CheckCircle2 size={19}/>:<Bell size={19}/>;
  const row=(item:DashboardNotice)=>{const href=item.actionUrl&&item.actionUrl.startsWith("/")&&!item.actionUrl.startsWith("//")?item.actionUrl:null;const external=item.actionUrl?.startsWith("https://")?item.actionUrl:null;const content=<><i className={`notification-row-icon notification-icon-${item.template||"general"}`}>{noticeIcon(item)}</i><div className="notification-row-copy"><header><strong>{item.title}</strong>{!item.read&&<em>جديد</em>}</header><p>{item.body}</p><footer><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleTimeString("ar-SA",{hour:"numeric",minute:"2-digit"})}</time>{(href||external)&&<small>{item.actionLabel||"فتح التفاصيل"}<ArrowLeft size={12}/></small>}</footer></div>{!item.read&&<span className="notification-unread-dot" aria-label="غير مقروء"/>}</>;const className=`notification-row${!item.read?" new":""}`;return href?<Link href={href} key={item.id} onClick={()=>void onRead(item.id)} className={className}>{content}</Link>:external?<a href={external} target="_blank" rel="noopener noreferrer" key={item.id} onClick={()=>void onRead(item.id)} className={className}>{content}</a>:<button type="button" key={item.id} onClick={()=>void onRead(item.id)} className={className}>{content}</button>;};
  return <><DashboardTitle title="الإشعارات" description="كل تحديث مرتب زمنيًا، مع انتقال مباشر إلى الإجراء المرتبط." action={unread?<div className="notifications-title-actions"><span className="notifications-unread-badge">{unread} غير مقروءة</span><button type="button" className="button button-soft" onClick={()=>void onReadAll()}><CheckCircle2 size={15}/>قراءة الكل</button></div>:<span className="notifications-all-read"><CheckCircle2 size={15}/>أنت مطّلع على كل جديد</span>}/><div className="notifications-filter" role="tablist" aria-label="تصفية الإشعارات"><button type="button" role="tab" aria-selected={filter==="all"} className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>الكل <b>{rows.length}</b></button><button type="button" role="tab" aria-selected={filter==="unread"} className={filter==="unread"?"active":""} onClick={()=>setFilter("unread")}>غير المقروءة <b>{unread}</b></button></div>{visible.length?<section className="notifications-groups">{grouped.map(([label,items])=><section key={label} className="notification-day"><h2>{label}</h2><div className="dashboard-panel notifications-panel">{items.map(row)}</div></section>)}</section>:<EmptyPanel title={filter==="unread"?"لا توجد إشعارات غير مقروءة":"لا توجد إشعارات"} text={filter==="unread"?"رائع، قرأت جميع التحديثات الحالية.":"ستصلك هنا حالة طلبات المواد وتأكيدات الشراء."}/>}</>;
}

function Support({rows}:{rows:DashboardTicket[]}) { return <><DashboardTitle title="الدعم الفني" description="التذاكر والردود مرتبطة بحسابك ولا يراها غيرك وفريق الدعم." action={<Link href="/support" className="button button-primary">فتح تذكرة جديدة</Link>}/>{rows.length?<section className="dashboard-panel support-ticket-history">{rows.map((ticket)=><Link className="support-ticket-card" href={`/support?ticket=${ticket.id}`} key={ticket.id}><header><span><strong>{ticket.title}</strong><small dir="ltr">#{ticket.ticketNumber}</small></span><em>{statusLabel(ticket.status)}</em></header><p>{supportCategoryLabel(ticket.category)} · آخر تحديث {new Date(ticket.createdAt).toLocaleDateString("ar-SA")}</p><div className="support-ticket-card-footer"><span>{ticket.replies.length ? `${ticket.replies.length} ردود في المحادثة` : "بانتظار رد فريق الدعم"}</span><b>فتح المحادثة <ArrowLeft size={14}/></b></div></Link>)}</section>:<section className="dashboard-panel support-contact"><LifeBuoy size={33}/><h2>لا توجد تذاكر بعد</h2><p>اذكر رقم الطلب أو اسم المادة لتسريع المعالجة.</p><Link href="/support" className="button button-soft">تواصل مع الدعم</Link></section>}</>; }

function Account({user,institutions}:{user:DashboardUser;institutions:Institution[]}) {
  const [form,setForm]=useState(user); const [message,setMessage]=useState(""); const [saving,setSaving]=useState(false);
  const institution = useMemo(()=>institutions.find((item)=>item.slug===form.universitySlug),[form.universitySlug,institutions]);
  const catalog = useAcademicPrograms(form.universitySlug);
  const save = async (event:React.FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setMessage(""); const response=await fetch("/api/profile",{method:"PATCH",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(form)}); const result=await response.json() as {error?:string}; setMessage(response.ok?"تم حفظ بياناتك بنجاح":result.error||"تعذر الحفظ"); setSaving(false); };
  return <><DashboardTitle title="إعدادات الحساب" description="يجب أن تبقى بياناتك مكتملة لتتمكن من الشراء وطلب المواد."/><div className="dashboard-two-columns account-grid"><form className="dashboard-panel account-form" onSubmit={save}><div className="account-avatar"><span>{form.fullName[0]}</span><b>{institution?.name}</b></div><label>الاسم الكامل<input required minLength={5} value={form.fullName} onChange={(event)=>setForm({...form,fullName:event.target.value})}/></label><div className="two-fields"><label>رقم الجوال<input required value={form.phone} onChange={(event)=>setForm({...form,phone:event.target.value})} dir="ltr"/></label><label>البريد الإلكتروني<input value={form.email} disabled dir="ltr"/></label></div><div className="two-fields"><label>الجامعة<select required value={form.universitySlug} onChange={(event)=>setForm({...form,universitySlug:event.target.value,specialty:""})}>{institutions.map((item)=><option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label><label>التخصص<select required disabled={catalog.loading} value={form.specialty} onChange={(event)=>setForm({...form,specialty:event.target.value})}><option value="">{catalog.loading?"جارٍ التحميل...":"اختر تخصصك"}</option>{form.specialty&&!catalog.programs.some((item)=>item.name===form.specialty)&&<option value={form.specialty}>{form.specialty}</option>}{catalog.programs.map((item)=><option key={`${item.name}-${item.degree}`} value={item.name}>{item.name} — {item.degree}</option>)}</select></label></div><label>المستوى الدراسي<select value={form.academicLevel||""} onChange={(event)=>setForm({...form,academicLevel:event.target.value})}><option value="">اختر مستواك</option>{ACADEMIC_LEVELS.map((level)=><option key={level} value={level}>{level}</option>)}</select></label>{(message||catalog.error)&&<p className={message.startsWith("تم")?"auth-success":"form-error"}>{message||catalog.error}</p>}<button className="button button-primary" disabled={saving||catalog.loading}>{saving?"جارٍ الحفظ...":"حفظ التغييرات"}</button></form><SecurityCard /></div><AppearanceSettings /></>;
}

function SecurityCard() {
  const [sessions,setSessions]=useState<SessionRow[]|null>(null); const [sessionsError,setSessionsError]=useState(""); const [busy,setBusy]=useState("");
  const [passwordMessage,setPasswordMessage]=useState(""); const [deleteMessage,setDeleteMessage]=useState(""); const [showDelete,setShowDelete]=useState(false);
  const loadSessions=useCallback(async()=>{ try{ const response=await fetch("/api/profile/sessions",{credentials:"same-origin",cache:"no-store"}); const data=await response.json() as {sessions?:SessionRow[];error?:string}; if(!response.ok)throw new Error(data.error||"تعذر تحميل الأجهزة"); setSessions(data.sessions||[]); setSessionsError(""); }catch(caught){ setSessionsError(caught instanceof Error?caught.message:"تعذر تحميل الأجهزة"); setSessions([]); } },[]);
  useEffect(()=>{ const timer=window.setTimeout(()=>void loadSessions(),0); return()=>window.clearTimeout(timer); },[loadSessions]);
  const changePassword=async(event:React.FormEvent<HTMLFormElement>)=>{ event.preventDefault(); const element=event.currentTarget; const data=new FormData(element); const next=String(data.get("newPassword")||""); if(next!==String(data.get("confirmPassword")||"")){setPasswordMessage("تأكيد كلمة المرور غير متطابق");return;} setBusy("password"); setPasswordMessage(""); try{ const response=await fetch("/api/profile/password",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({currentPassword:data.get("currentPassword"),newPassword:next})}); const result=await response.json() as {error?:string;revokedSessions?:number}; if(!response.ok)throw new Error(result.error||"تعذر تغيير كلمة المرور"); setPasswordMessage(`تم تغيير كلمة المرور${result.revokedSessions?` وتسجيل الخروج من ${result.revokedSessions} جهاز آخر`:""}.`); element.reset(); void loadSessions(); }catch(caught){ setPasswordMessage(caught instanceof Error?caught.message:"تعذر تغيير كلمة المرور"); } finally{ setBusy(""); } };
  const revoke=async(session:SessionRow)=>{ setBusy(`session-${session.id}`); try{ const response=await fetch("/api/profile/sessions",{method:"DELETE",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({id:session.id})}); const result=await response.json() as {error?:string}; if(!response.ok)throw new Error(result.error||"تعذر تسجيل خروج الجهاز"); await loadSessions(); }catch(caught){ setSessionsError(caught instanceof Error?caught.message:"تعذر تسجيل خروج الجهاز"); } finally{ setBusy(""); } };
  const deleteAccount=async(event:React.FormEvent<HTMLFormElement>)=>{ event.preventDefault(); const data=new FormData(event.currentTarget); setBusy("delete"); setDeleteMessage(""); try{ const response=await fetch("/api/mobile/account",{method:"DELETE",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({password:data.get("password"),confirmation:data.get("confirmation")})}); const result=await response.json() as {error?:string}; if(!response.ok)throw new Error(result.error||"تعذر حذف الحساب"); await signOutWeb("/"); }catch(caught){ setDeleteMessage(caught instanceof Error?caught.message:"تعذر حذف الحساب"); setBusy(""); } };
  return <section className="dashboard-panel security-card"><UserRound size={27}/><h2>الأمان والأجهزة</h2><p>الجلسة الحالية محمية بملف تعريف HttpOnly. يمكنك تغيير كلمة المرور وإدارة الأجهزة المتصلة بحسابك من هنا.</p>
    <form className="security-form" onSubmit={changePassword}><h3><KeyRound size={16}/> تغيير كلمة المرور</h3><label>كلمة المرور الحالية<input name="currentPassword" type="password" required autoComplete="current-password" dir="ltr"/></label><label>كلمة المرور الجديدة<input name="newPassword" type="password" required minLength={10} autoComplete="new-password" dir="ltr"/></label><label>تأكيد كلمة المرور الجديدة<input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" dir="ltr"/></label><small>10 أحرف على الأقل مع حرف كبير ورقم ورمز. سيتم تسجيل الخروج من الأجهزة الأخرى تلقائيًا.</small>{passwordMessage&&<p className={passwordMessage.startsWith("تم")?"auth-success":"form-error"}>{passwordMessage}</p>}<button className="button button-soft" disabled={busy==="password"}>{busy==="password"?"جارٍ الحفظ...":"تحديث كلمة المرور"}</button><Link href="/forgot-password" className="security-forgot">نسيت كلمة المرور الحالية؟</Link></form>
    <div className="security-sessions"><h3><Laptop size={16}/> الأجهزة المتصلة</h3>{sessions===null?<small>جارٍ تحميل الأجهزة...</small>:sessions.length?<ul>{sessions.map((session)=><li key={session.id}><i>{session.platform==="mobile"?<Smartphone size={15}/>:<Laptop size={15}/>}</i><span><strong>{session.deviceLabel}{session.current?" · هذا الجهاز":""}</strong><small>{session.platform==="mobile"?"التطبيق":"الويب"} · آخر نشاط {new Date(session.lastSeenAt).toLocaleString("ar-SA")}</small></span>{!session.current&&<button type="button" disabled={Boolean(busy)} onClick={()=>void revoke(session)}>{busy===`session-${session.id}`?"...":"تسجيل الخروج"}</button>}</li>)}</ul>:<small>لا توجد أجهزة أخرى متصلة.</small>}{sessionsError&&<p className="form-error">{sessionsError}</p>}<small className="security-hint">حد الأجهزة يشمل الويب والتطبيق معًا؛ سجّل الخروج من جهاز قديم إذا تعذر عليك الدخول من جهاز جديد.</small></div>
    <button className="danger" onClick={()=>void signOutWeb("/")}>تسجيل الخروج</button>
    <div className="security-delete"><button type="button" className="link-danger" onClick={()=>setShowDelete((value)=>!value)}><Trash2 size={14}/> حذف الحساب نهائيًا</button>{showDelete&&<form onSubmit={deleteAccount}><p>سيُحذف حسابك وبياناتك غير المالية وفق سياسة الخصوصية. تبقى الفواتير محفوظة للالتزامات النظامية.</p><label>كلمة المرور<input name="password" type="password" required autoComplete="current-password" dir="ltr"/></label><label>اكتب <b>حذف حسابي</b> للتأكيد<input name="confirmation" required autoComplete="off" placeholder="حذف حسابي"/></label>{deleteMessage&&<p className="form-error">{deleteMessage}</p>}<button className="danger" disabled={busy==="delete"}>{busy==="delete"?"جارٍ الحذف...":"تأكيد حذف الحساب"}</button></form>}</div>
  </section>;
}

function EmptyPanel({title,text}:{title:string;text:string}) { return <section className="dashboard-panel dashboard-empty-state"><i><BookOpen size={28}/></i><h2>{title}</h2><p>{text}</p><div><Link href="/courses" className="button button-soft">تصفح المواد</Link><Link href="/request-course" className="button button-ghost">طلب مادة</Link></div></section>; }
function refundStatusLabel(status:string) { return ({ pending:"قيد المراجعة",first_approved:"قيد المراجعة",approved_pending_provider:"قيد التنفيذ",provider_processing:"قيد التنفيذ",provider_pending:"قيد التنفيذ",provider_failed:"قيد المتابعة",completed:"مكتمل",rejected:"مرفوض" } as Record<string,string>)[status] || status; }
function statusLabel(status:string) { return ({ new:"جديد",open:"مفتوح",in_progress:"قيد المعالجة",resolved:"تم الحل",closed:"مغلق",assigned:"مسند لمشرف",reviewing:"قيد المراجعة",planned:"مخطط له",producing:"قيد الإنتاج",available:"متاح",pending:"قيد الانتظار",initiated:"بانتظار الدفع",verification_pending:"قيد التحقق من الدفع",payment_review:"قيد مراجعة الدفع",paid:"مدفوع",failed:"غير مكتمل",partially_refunded:"مسترد جزئيًا",refunded:"مسترد",cancelled:"ملغي",voided:"ملغى من بوابة الدفع" } as Record<string,string>)[status] || "حالة غير معروفة"; }
function supportCategoryLabel(category:string) { return ({ technical:"مشكلة تقنية",payment:"الدفع والفواتير",course:"المادة والمحتوى",account:"الحساب والدخول",other:"موضوع آخر" } as Record<string,string>)[category] || "موضوع عام"; }
