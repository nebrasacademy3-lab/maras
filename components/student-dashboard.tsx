"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, BookOpen, CheckCircle2, FileUp, LayoutDashboard, LifeBuoy, LogOut, Play, Receipt, Settings, Sparkles, TrendingUp, UserRound } from "lucide-react";
import type { Institution } from "@/lib/data";
import { useAcademicPrograms } from "@/components/use-academic-programs";
import { AppearanceSettings } from "@/components/theme-provider";
import { useRealtimeSync } from "@/components/realtime-sync";

export type DashboardUser = { id:number; fullName:string; email:string; phone:string; universitySlug:string; specialty:string };
export type DashboardCourse = { slug:string; title:string; university:string; color:string; icon:string; progress:number; current:string; remaining:string };
export type DashboardOrder = { orderNumber:string; courseTitle:string; total:number; currency:string; status:string; createdAt:string };
export type DashboardRequest = { id:number; courseName:string; status:string; attachmentsCount:number; createdAt:string };
export type DashboardNotice = { id:number; title:string; body:string; actionUrl:string | null; actionLabel?:string | null; presentation?:string; createdAt:string; read:boolean };
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

export function StudentDashboard({ initialView = "overview", user, owned, orders, requests, notices, tickets, institutions, recommended }: { initialView?:string; user:DashboardUser; owned:DashboardCourse[]; orders:DashboardOrder[]; requests:DashboardRequest[]; notices:DashboardNotice[]; tickets:DashboardTicket[]; institutions:Institution[]; recommended:DashboardRecommendation[] }) {
  const [active, setActive] = useState(initialView);
  const [live, setLive] = useState({ user, owned, orders, requests, notices, tickets, institutions, recommended });
  const [noticeRows, setNoticeRows] = useState(notices);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/mobile/dashboard", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as Partial<typeof live> & { user?: DashboardUser; owned?: DashboardCourse[]; orders?: DashboardOrder[]; requests?: DashboardRequest[]; notifications?: Array<DashboardNotice & { readAt?: string | null }>; tickets?: DashboardTicket[]; institutions?: Institution[]; recommended?: DashboardRecommendation[] };
      const nextNotices = payload.notifications?.map((item) => ({ ...item, read: typeof item.read === "boolean" ? item.read : Boolean(item.readAt) }));
      if (nextNotices) setNoticeRows(nextNotices);
      setLive((current) => ({ user: payload.user || current.user, owned: payload.owned || current.owned, orders: payload.orders || current.orders, requests: payload.requests || current.requests, notices: nextNotices || current.notices, tickets: payload.tickets || current.tickets, institutions: payload.institutions || current.institutions, recommended: payload.recommended || current.recommended }));
    } catch { /* Keep the last known snapshot when the network is temporarily unavailable. */ }
  }, []);
  useRealtimeSync((payload) => {
    if (!payload.changed || payload.changed.some((channel) => ["account", "commerce", "support", "notifications", "requests", "catalog", "settings"].includes(channel))) void refresh();
  });
  const unread = noticeRows.filter((item) => !item.read).length;
  useEffect(() => {
    if (active !== "notifications") return;
    const controller = new AbortController();
    fetch("/api/mobile/notifications", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { notifications?: Array<{ id: number; title: string; body: string; actionUrl: string | null; createdAt: string; readAt: string | null }> } : null)
      .then((payload) => {
        if (!payload || controller.signal.aborted) return;
        const rows = (payload.notifications || []).map((item) => ({ id: item.id, title: item.title, body: item.body, actionUrl: item.actionUrl, createdAt: item.createdAt, read: Boolean(item.readAt) }));
        setNoticeRows(rows);
        return fetch("/api/mobile/notifications", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }), signal: controller.signal });
      })
      .then(() => {
        setNoticeRows((rows) => rows.map((item) => ({ ...item, read: true })));
        window.dispatchEvent(new CustomEvent("meras:notifications-read", { detail: { unread: 0 } }));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [active]);
  const institution = live.institutions.find((item) => item.slug === live.user.universitySlug);
  let content: React.ReactNode;
  if (active === "overview") content = <Overview user={live.user} owned={live.owned} requests={live.requests} recommended={live.recommended} setActive={setActive} />;
  else if (active === "courses") content = <MyCourses owned={live.owned} />;
  else if (active === "requests") content = <Requests rows={live.requests} />;
  else if (active === "orders") content = <Orders rows={live.orders} />;
  else if (active === "notifications") content = <Notifications
    rows={noticeRows}
    onRead={async (id) => {
      setNoticeRows((rows) => rows.map((item) => item.id === id ? { ...item, read: true } : item));
      await fetch("/api/mobile/notifications", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => undefined);
      const nextUnread = Math.max(0, noticeRows.filter((item) => !item.read && item.id !== id).length);
      window.dispatchEvent(new CustomEvent("meras:notifications-read", { detail: { unread: nextUnread } }));
    }}
    onReadAll={async () => {
      setNoticeRows((rows) => rows.map((item) => ({ ...item, read: true })));
      await fetch("/api/mobile/notifications", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => undefined);
      window.dispatchEvent(new CustomEvent("meras:notifications-read", { detail: { unread: 0 } }));
    }}
  />;
  else if (active === "support") content = <Support rows={live.tickets} />;
  else content = <Account user={live.user} institutions={live.institutions} />;
  const logout = () => { window.location.replace("/api/auth/logout?to=%2F"); };
  return <div className="student-app"><aside className="student-sidebar"><div className="student-profile-mini"><div>{live.user.fullName[0]}</div><span><strong>{live.user.fullName}</strong><small>{institution?.name || "مراس العلم"}</small></span></div><nav>{nav.map((item) => { const Icon=item.icon; return <button key={item.id} className={active===item.id?"active":""} onClick={() => setActive(item.id)}><Icon size={18} />{item.label}{item.id==="notifications"&&unread>0&&<i>{unread}</i>}</button>; })}</nav><div className="student-sidebar-help"><LifeBuoy size={21} /><strong>تحتاج مساعدة؟</strong><small>فريق مراس معك</small><button onClick={() => setActive("support")}>تواصل معنا</button></div><button className="student-logout" onClick={logout}><LogOut size={17} /> تسجيل الخروج</button></aside><div className="student-content"><div className="student-mobile-tabs">{nav.slice(0,5).map((item)=>{const Icon=item.icon;return <button key={item.id} onClick={()=>setActive(item.id)} className={active===item.id?"active":""}><Icon size={18}/><span>{item.label}</span></button>;})}</div>{content}</div></div>;
}

function DashboardTitle({ eyebrow,title,description,action }: {eyebrow?:string;title:string;description?:string;action?:React.ReactNode}) { return <div className="dashboard-title"><div>{eyebrow&&<span>{eyebrow}</span>}<h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>; }

function Overview({ user, owned, requests, recommended, setActive }:{user:DashboardUser;owned:DashboardCourse[];requests:DashboardRequest[];recommended:DashboardRecommendation[];setActive:(id:string)=>void}) {
  const average = owned.length ? Math.round(owned.reduce((sum,item)=>sum+item.progress,0)/owned.length) : 0;
  const first = owned[0];
  return <><DashboardTitle eyebrow={`مرحبًا، ${user.fullName.split(" ")[0]} 👋`} title={first ? "كمّل من حيث توقفت" : "ملفك الدراسي جاهز"} description={first ? `لديك ${owned.length} مواد نشطة، وتقدمك محفوظ على جميع أجهزتك.` : "ابدأ باستكشاف المواد، أو اطلب مادتك إذا لم تجدها."} action={<Link href="/courses" className="button button-primary">استكشف المواد <Sparkles size={16}/></Link>} />
    <div className="dashboard-stat-grid"><article><i><BookOpen size={20}/></i><span><small>المواد النشطة</small><strong>{owned.length}</strong><em>مرتبطة بمشترياتك</em></span></article><article><i><FileUp size={20}/></i><span><small>طلبات المواد</small><strong>{requests.length}</strong><em>يمكن متابعتها هنا</em></span></article><article><i><CheckCircle2 size={20}/></i><span><small>متوسط التقدم</small><strong>{average}%</strong><em>محفوظ تلقائيًا</em></span></article><article><i><TrendingUp size={20}/></i><span><small>حالة الحساب</small><strong>مكتمل</strong><em>جاهز للشراء</em></span></article></div>
    {first ? <div className="continue-card"><div className={`continue-art bg-gradient-to-br ${first.color}`}><span className="course-cover-grid"/><strong>{first.icon}</strong><i><Play size={22} fill="currentColor"/></i></div><div className="continue-info"><span>تابع الآن</span><h2>{first.title}</h2><p>{first.current}</p><div className="continue-progress"><i style={{width:`${first.progress}%`}}/></div><small><b>{first.progress}% مكتمل</b><em>{first.remaining}</em></small></div><Link href={`/learn/${first.slug}`} className="button button-primary">متابعة الدرس <ArrowLeft size={16}/></Link></div> : <section className="dashboard-panel dashboard-empty-state"><i><BookOpen size={31}/></i><h2>لا توجد مواد مفعّلة بعد</h2><p>جرّب الدرس المجاني قبل الشراء، أو أرسل طلب مادة مع السلايدات ليصل مباشرة إلى فريق المحتوى.</p><div><Link href="/courses" className="button button-primary">تصفح المواد</Link><Link href="/request-course" className="button button-soft">طلب مادة ورفع الملفات</Link></div></section>}
    <div className="dashboard-two-columns"><section className="dashboard-panel"><div className="panel-head"><div><h2>موادك</h2><p>صلاحيات الوصول الفعلية</p></div><button onClick={()=>setActive("courses")}>عرض الكل <ArrowLeft size={14}/></button></div><div className="mini-course-list">{owned.slice(0,3).map((course)=><Link key={course.slug} href={`/learn/${course.slug}`}><div className={`bg-gradient-to-br ${course.color}`}>{course.icon}</div><span><strong>{course.title}</strong><small>{course.current}</small><i><b style={{width:`${course.progress}%`}}/></i></span><em>{course.progress}%</em></Link>)}{owned.length===0&&<p className="panel-empty-copy">ستظهر المواد هنا فور تأكيد الدفع من الخادم.</p>}</div></section><section className="dashboard-panel request-shortcut"><FileUp size={30}/><h2>مادتك غير موجودة؟</h2><p>ارفع اسم المادة والسلايدات أو توصيف المقرر، وسيتابع المشرف حالة الطلب معك. نستهدف توفير المادة خلال 24 ساعة.</p><Link href="/request-course" className="button button-soft">إنشاء طلب جديد</Link></section></div>
    <section className="dashboard-panel dashboard-recommendations"><div className="panel-head"><div><h2>مقترحة لجامعتك وتخصصك</h2><p>نرتب المطابق أولًا، ويمكنك استكشاف بقية الجامعات والتخصصات وشراء موادها أيضًا.</p></div><Link href="/courses">كل الجامعات <ArrowLeft size={14}/></Link></div>{recommended.length?<div>{recommended.map((course)=><Link href={`/courses/${course.slug}`} key={course.slug}><i className={`bg-gradient-to-br ${course.color}`}>{course.icon}</i><span><em>{course.match}</em><strong>{course.title}</strong><small>{course.university} · {course.specialty}</small></span><b>{course.price} ر.س <ArrowLeft size={14}/></b></Link>)}</div>:<p className="panel-empty-copy">لا توجد مادة منشورة مطابقة بعد. استخدم طلب مادة وارفع التوصيف ليصل إلى المشرف.</p>}</section>
  </>;
}

function MyCourses({owned}:{owned:DashboardCourse[]}) { const [filter,setFilter]=useState("الكل"); const rows=filter==="مكتملة"?owned.filter(c=>c.progress>=90):filter==="قيد التعلم"?owned.filter(c=>c.progress<90):owned; return <><DashboardTitle title="موادي" description="لا تظهر هنا إلا المواد ذات الصلاحية النشطة." action={<Link href="/courses" className="button button-primary">استكشف مواد جديدة</Link>}/><div className="dashboard-tabs">{["الكل","قيد التعلم","مكتملة"].map(item=><button key={item} className={filter===item?"active":""} onClick={()=>setFilter(item)}>{item}</button>)}</div>{rows.length?<div className="owned-courses-grid">{rows.map(course=><article key={course.slug}><div className={`owned-course-art bg-gradient-to-br ${course.color}`}><span className="course-cover-grid"/><strong>{course.icon}</strong><em>{course.progress}%</em></div><div><small>{course.university}</small><h3>{course.title}</h3><p>آخر درس: {course.current}</p><div className="owned-progress"><i style={{width:`${course.progress}%`}}/></div><span><b>{course.progress}% مكتمل</b><em>{course.remaining}</em></span><Link href={`/learn/${course.slug}`} className="button button-soft">متابعة التعلم <ArrowLeft size={15}/></Link></div></article>)}</div>:<EmptyPanel title="لا توجد مواد في هذا التصنيف" text="استكشف الفهرس أو اطلب مادة غير متوفرة."/>}</>; }

function Requests({rows}:{rows:DashboardRequest[]}) { return <><DashboardTitle title="طلبات المواد" description="طلباتك مرتبطة بملفك وتصل إلى المشرف مع المرفقات." action={<Link href="/request-course" className="button button-primary"><FileUp size={16}/> طلب مادة</Link>}/>{rows.length?<section className="dashboard-panel request-history">{rows.map((row)=><article key={row.id}><i><FileUp size={18}/></i><span><strong>{row.courseName}</strong><small>#{row.id} · {new Date(row.createdAt).toLocaleDateString("ar-SA")} · {row.attachmentsCount} مرفقات</small></span><em className={`request-status status-${row.status}`}>{statusLabel(row.status)}</em></article>)}</section>:<EmptyPanel title="لم ترسل طلبات بعد" text="إذا لم تجد المادة، ارفع السلايدات أو التوصيف وسنبدأ تتبعها."/>}</>; }

function Orders({rows}:{rows:DashboardOrder[]}) { return <><DashboardTitle title="الطلبات والفواتير" description="سجل عمليات الدفع الفعلية المرتبطة بحسابك."/>{rows.length?<div className="dashboard-panel table-panel"><div className="orders-table"><div className="table-row table-head"><span>رقم الطلب</span><span>المادة</span><span>التاريخ</span><span>المبلغ</span><span>الحالة</span><span></span></div>{rows.map(row=><div className="table-row" key={row.orderNumber}><span dir="ltr">#{row.orderNumber}</span><strong>{row.courseTitle}</strong><span>{new Date(row.createdAt).toLocaleDateString("ar-SA")}</span><span>{row.total} {row.currency}</span><em>{statusLabel(row.status)}</em><span /></div>)}</div></div>:<EmptyPanel title="لا توجد عمليات شراء" text="لن تُفعّل أي مادة إلا بعد تأكيد الدفع من Tap على الخادم."/>}</>; }

function Notifications({rows,onRead,onReadAll}:{rows:DashboardNotice[];onRead:(id:number)=>void|Promise<void>;onReadAll:()=>void|Promise<void>}) {
  const unread = rows.filter((item)=>!item.read).length;
  return <><DashboardTitle title="الإشعارات" description="تحديثات المواد والطلبات والحساب." action={unread ? <div className="notifications-title-actions"><span className="notifications-unread-badge">{unread} غير مقروءة</span><button type="button" className="button button-soft" onClick={()=>void onReadAll()}>قراءة الكل</button></div> : undefined}/>{rows.length?<section className="dashboard-panel notifications-panel">{rows.map((item)=>{const href=item.actionUrl&&item.actionUrl.startsWith("/")?item.actionUrl:null;const external=item.actionUrl?.startsWith("https://")?item.actionUrl:null; const content=<><i><Bell size={18}/></i><div><strong>{item.title}</strong><p>{item.body}</p>{(href||external)&&<small>فتح التفاصيل <ArrowLeft size={12}/></small>}</div><span>{new Date(item.createdAt).toLocaleDateString("ar-SA")}</span></>; return href?<Link href={href} key={item.id} onClick={()=>void onRead(item.id)} className={!item.read?"new":""}>{content}</Link>:external?<a href={external} target="_blank" rel="noopener noreferrer" key={item.id} onClick={()=>void onRead(item.id)} className={!item.read?"new":""}>{content}</a>:<article key={item.id} onClick={()=>void onRead(item.id)} className={!item.read?"new":""}>{content}</article>;})}</section>:<EmptyPanel title="لا توجد إشعارات" text="ستصلك هنا حالة طلبات المواد وتأكيدات الشراء."/>}</>;
}

function Support({rows}:{rows:DashboardTicket[]}) { return <><DashboardTitle title="الدعم الفني" description="التذاكر والردود مرتبطة بحسابك ولا يراها غيرك وفريق الدعم." action={<Link href="/support" className="button button-primary">فتح تذكرة جديدة</Link>}/>{rows.length?<section className="dashboard-panel support-ticket-history">{rows.map((ticket)=><Link className="support-ticket-card" href={`/support?ticket=${ticket.id}`} key={ticket.id}><header><span><strong>{ticket.title}</strong><small dir="ltr">#{ticket.ticketNumber}</small></span><em>{statusLabel(ticket.status)}</em></header><p>{supportCategoryLabel(ticket.category)} · آخر تحديث {new Date(ticket.createdAt).toLocaleDateString("ar-SA")}</p><div className="support-ticket-card-footer"><span>{ticket.replies.length ? `${ticket.replies.length} ردود في المحادثة` : "بانتظار رد فريق الدعم"}</span><b>فتح المحادثة <ArrowLeft size={14}/></b></div></Link>)}</section>:<section className="dashboard-panel support-contact"><LifeBuoy size={33}/><h2>لا توجد تذاكر بعد</h2><p>اذكر رقم الطلب أو اسم المادة لتسريع المعالجة.</p><Link href="/support" className="button button-soft">تواصل مع الدعم</Link></section>}</>; }

function Account({user,institutions}:{user:DashboardUser;institutions:Institution[]}) {
  const [form,setForm]=useState(user); const [message,setMessage]=useState(""); const [saving,setSaving]=useState(false);
  const institution = useMemo(()=>institutions.find((item)=>item.slug===form.universitySlug),[form.universitySlug,institutions]);
  const catalog = useAcademicPrograms(form.universitySlug);
  const save = async (event:React.FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setMessage(""); const response=await fetch("/api/profile",{method:"PATCH",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(form)}); const result=await response.json() as {error?:string}; setMessage(response.ok?"تم حفظ بياناتك بنجاح":result.error||"تعذر الحفظ"); setSaving(false); };
  return <><DashboardTitle title="إعدادات الحساب" description="يجب أن تبقى بياناتك مكتملة لتتمكن من الشراء وطلب المواد."/><div className="dashboard-two-columns account-grid"><form className="dashboard-panel account-form" onSubmit={save}><div className="account-avatar"><span>{form.fullName[0]}</span><b>{institution?.name}</b></div><label>الاسم الكامل<input required minLength={5} value={form.fullName} onChange={(event)=>setForm({...form,fullName:event.target.value})}/></label><div className="two-fields"><label>رقم الجوال<input required value={form.phone} onChange={(event)=>setForm({...form,phone:event.target.value})} dir="ltr"/></label><label>البريد الإلكتروني<input value={form.email} disabled dir="ltr"/></label></div><div className="two-fields"><label>الجامعة<select required value={form.universitySlug} onChange={(event)=>setForm({...form,universitySlug:event.target.value,specialty:""})}>{institutions.map((item)=><option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label><label>التخصص<select required disabled={catalog.loading} value={form.specialty} onChange={(event)=>setForm({...form,specialty:event.target.value})}><option value="">{catalog.loading?"جارٍ التحميل...":"اختر تخصصك"}</option>{form.specialty&&!catalog.programs.some((item)=>item.name===form.specialty)&&<option value={form.specialty}>{form.specialty}</option>}{catalog.programs.map((item)=><option key={`${item.name}-${item.degree}`} value={item.name}>{item.name} — {item.degree}</option>)}</select></label></div>{(message||catalog.error)&&<p className={message.startsWith("تم")?"auth-success":"form-error"}>{message||catalog.error}</p>}<button className="button button-primary" disabled={saving||catalog.loading}>{saving?"جارٍ الحفظ...":"حفظ التغييرات"}</button></form><section className="dashboard-panel security-card"><UserRound size={27}/><h2>الأمان والجلسات</h2><p>الجلسة الحالية محمية بملف تعريف HttpOnly ولا يمكن لجافاسكربت قراءة رمزها.</p><Link href="/forgot-password">تغيير كلمة المرور <ArrowLeft size={14}/></Link><button className="danger" onClick={()=>window.location.replace("/api/auth/logout?to=%2F")}>تسجيل الخروج</button></section></div><AppearanceSettings /></>;
}

function EmptyPanel({title,text}:{title:string;text:string}) { return <section className="dashboard-panel dashboard-empty-state"><i><BookOpen size={28}/></i><h2>{title}</h2><p>{text}</p><div><Link href="/courses" className="button button-soft">تصفح المواد</Link><Link href="/request-course" className="button button-ghost">طلب مادة</Link></div></section>; }
function statusLabel(status:string) { return ({ new:"جديد",open:"مفتوح",in_progress:"قيد المعالجة",resolved:"تم الحل",closed:"مغلق",assigned:"مسند لمشرف",reviewing:"قيد المراجعة",planned:"مخطط له",producing:"قيد الإنتاج",available:"متاح",pending:"قيد الانتظار",initiated:"بانتظار الدفع",verification_pending:"قيد التحقق من الدفع",payment_review:"قيد مراجعة الدفع",paid:"مدفوع",failed:"غير مكتمل",partially_refunded:"مسترد جزئيًا",refunded:"مسترد",cancelled:"ملغي",voided:"ملغى من بوابة الدفع" } as Record<string,string>)[status] || "حالة غير معروفة"; }
function supportCategoryLabel(category:string) { return ({ technical:"مشكلة تقنية",payment:"الدفع والفواتير",course:"المادة والمحتوى",account:"الحساب والدخول",other:"موضوع آخر" } as Record<string,string>)[category] || "موضوع عام"; }
