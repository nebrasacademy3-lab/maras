"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, CheckCircle2, FileUp, PlayCircle, ShieldCheck, Sparkles } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { ThemeToggle } from "./theme-provider";

const steps=[
  {icon:Sparkles,kicker:"أهلًا بك في مراس",title:"منصتك مرتبطة بملفك الدراسي",text:"سنرشح لك المواد بحسب الجامعة والتخصص، بينما تبقى بقية الجامعات متاحة للبحث في أي وقت.",points:["كل المشتريات على حساب واحد","الفواتير والتقدم محفوظان","الإشعارات مرتبطة بطلباتك"]},
  {icon:PlayCircle,kicker:"المشاهدة والتقدم",title:"مشغل مراس يحفظ آخر ثانية",text:"جرّب الدرس المجاني أولًا. بعد الشراء تُفتح الدروس المدفوعة داخل المشغل بروابط بث قصيرة العمر.",points:["سرعات وجودات متعددة","ترجمة وملء الشاشة","علامة مائية وجلسة آمنة"]},
  {icon:FileUp,kicker:"إذا لم تجد المادة",title:"اطلبها وارفع السلايدات",text:"اكتب اسم المادة ورمزها، وارفع السلايدات أو توصيف المقرر. يصل الطلب والمرفقات للمشرف وتتابع حالته من لوحتك.",points:["حتى 5 ملفات خاصة","إسناد لمشرف محتوى","إشعار عند كل تحديث"]},
  {icon:ShieldCheck,kicker:"كل شيء جاهز",title:"ابدأ رحلتك بثقة",text:"ملفك مكتمل ويمكنك الآن الاستكشاف والشراء وطلب المواد وحفظ تقدمك من أي جهاز.",points:["بيانات حساب إلزامية","دفع مؤكد من الخادم","صلاحيات منفصلة لكل دور"]},
];

export function OnboardingTour({firstName}:{firstName:string}){const[step,setStep]=useState(0);const[loading,setLoading]=useState(false);const current=steps[step];const Icon=current.icon;const finish=async()=>{setLoading(true);const response=await fetch("/api/profile/onboarding",{method:"POST"});if(response.ok){const target=sessionStorage.getItem("meras_return_to")||"/dashboard";sessionStorage.removeItem("meras_return_to");window.location.assign(target);}else setLoading(false);};return <main className="onboarding-page"><header><BrandLogo compact/><ThemeToggle compact/></header><section className="onboarding-shell"><aside><span>مرحبًا {firstName}</span><h1>دليل البداية</h1><p>أربع خطوات قصيرة قبل الانطلاق.</p><nav>{steps.map((item,index)=><button key={item.title} className={index===step?"active":index<step?"done":""} onClick={()=>setStep(index)}><i>{index<step?<CheckCircle2 size={16}/>:index+1}</i><span><strong>{item.kicker}</strong><small>{item.title}</small></span></button>)}</nav></aside><article><div className="onboarding-visual"><span/><i><Icon size={45}/></i><b>{String(step+1).padStart(2,"0")}</b></div><div className="onboarding-copy"><span>{current.kicker}</span><h2>{current.title}</h2><p>{current.text}</p><ul>{current.points.map((point)=><li key={point}><CheckCircle2 size={17}/>{point}</li>)}</ul>{step===2&&<Link href="/request-course" className="onboarding-inline-link"><FileUp size={17}/> فتح نموذج طلب المادة</Link>}<footer><button className="button button-ghost" disabled={step===0} onClick={()=>setStep(step-1)}>السابق</button>{step<steps.length-1?<button className="button button-primary" onClick={()=>setStep(step+1)}>التالي <ArrowLeft size={16}/></button>:<button className="button button-primary" disabled={loading} onClick={finish}>{loading?"جارٍ تجهيز لوحتك...":"اذهب إلى لوحتي"} <BookOpen size={16}/></button>}</footer></div></article></section></main>;}
