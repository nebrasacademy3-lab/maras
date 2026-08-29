"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookMarked, BookOpen, GraduationCap, Search, Sparkles } from "lucide-react";
import { getProgramCourses, type AcademicProgram } from "@/lib/academic-data";

export function InstitutionPrograms({ programs, institutionName }: { programs: AcademicProgram[]; institutionName: string }) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("الكل");
  const areas = useMemo(() => ["الكل", ...Array.from(new Set(programs.map((item) => item.area)))], [programs]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return programs.filter((item) => (area === "الكل" || item.area === area) && (!needle || `${item.name} ${item.area} ${item.degree}`.toLowerCase().includes(needle)));
  }, [programs, query, area]);

  return <div className="program-browser">
    <div className="program-browser-tools">
      <label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`ابحث في برامج ${institutionName}...`} /></label>
      <div className="program-area-tabs" aria-label="تصفية التخصصات">{areas.map((item) => <button type="button" key={item} className={area === item ? "active" : ""} onClick={() => setArea(item)}>{item}</button>)}</div>
    </div>
    <div className="program-results-note"><Sparkles size={15} /><span>نعرض {filtered.length} من {programs.length} برنامجًا. نميّز البرامج المستخرجة من مصدر رسمي عن خريطة الاكتشاف العامة، ولا نعدّ المادة منشورة إلا إذا كانت لها دروس فعلية.</span></div>
    {filtered.length ? <div className="program-grid">{filtered.map((program) => {
      const courseNames = getProgramCourses(program);
      return <details className="program-card" key={`${program.name}-${program.degree}`}>
        <summary><i><GraduationCap size={20} /></i><span><small>{program.area} · {program.degree} · {program.verificationStatus === "official-program" ? "موثق من المصدر الرسمي" : program.verificationStatus === "pending-review" ? "قيد المراجعة" : "خريطة اكتشاف"}</small><strong>{program.name}</strong><em>{courseNames.length} مواد مقترحة <ArrowLeft size={14} /></em></span></summary>
        <div className="program-card-body"><div className="program-courses-title"><BookOpen size={16} /><strong>مواد تأسيسية ومقترحة</strong></div><p className="program-disclaimer">هذه أسماء إرشادية للمساعدة في طلب المادة وليست خطة دراسية رسمية أو دورة منشورة. المواد المتاحة فعلًا تظهر في فهرس المواد بعد اعتماد الوحدات والدروس.</p>{program.sourceUrl&&program.verificationStatus==="official-program"?<a className="catalog-source" href={program.sourceUrl} target="_blank" rel="noreferrer">فتح مصدر البرنامج الرسمي <ArrowLeft size={14}/></a>:null}<div className="program-course-chips">{courseNames.map((course) => <Link key={course} href={`/courses?q=${encodeURIComponent(course)}`}><BookMarked size={13} />{course}</Link>)}</div><footer><p>لا تجد المادة التي تحتاجها؟ أرسل السلايدات أو توصيف المقرر ليصل الطلب إلى المشرف.</p><Link className="button button-soft" href="/request-course">اطلب شرح مادة <ArrowLeft size={15} /></Link></footer></div>
      </details>;
    })}</div> : <div className="program-empty"><Search size={27} /><h3>لا توجد نتيجة مطابقة</h3><p>جرّب اسمًا أقصر أو اختر «الكل». وإذا كانت المادة غير موجودة اطلبها ونستهدف توفيرها خلال 24 ساعة.</p><Link className="button button-primary" href="/request-course">طلب مادة · خلال 24 ساعة <ArrowLeft size={15}/></Link></div>}
  </div>;
}
