"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, BookMarked, BookOpen, ChevronDown, ExternalLink, GraduationCap, Search, Sparkles, X } from "lucide-react";
import { getProgramCourses, type AcademicProgram } from "@/lib/academic-data";
import { usePlatformControls } from "./use-platform-controls";

const ALL_AREAS = "الكل";

export function InstitutionPrograms({ programs, institutionName }: { programs: AcademicProgram[]; institutionName: string }) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState(ALL_AREAS);
  const controls = usePlatformControls();
  const areas = useMemo(() => [ALL_AREAS, ...Array.from(new Set(programs.map((item) => item.area))).sort((a, b) => a.localeCompare(b, "ar"))], [programs]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ar");
    return programs.filter((item) => {
      const searchable = `${item.name} ${item.area} ${item.degree} ${(item.aliases || []).join(" ")}`.toLocaleLowerCase("ar");
      return (area === ALL_AREAS || item.area === area) && (!needle || searchable.includes(needle));
    });
  }, [programs, query, area]);

  function clearFilters() { setQuery(""); setArea(ALL_AREAS); }

  return (
    <section className="program-browser" aria-labelledby="program-browser-title">
      <div className="program-browser-tools">
        <label className="program-primary-search">
          <Search size={19} aria-hidden="true" />
          <span className="sr-only" id="program-browser-title">البحث في برامج {institutionName}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`ابحث في تخصصات ${institutionName}`} type="search" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="مسح البحث"><X size={15} /></button>}
        </label>
        <label className="program-area-select"><span>المجال</span><select value={area} onChange={(event) => setArea(event.target.value)} aria-label="تصفية التخصصات حسب المجال">{areas.map((item) => <option key={item}>{item === ALL_AREAS ? "كل المجالات" : item}</option>)}</select></label>
      </div>

      <div className="program-results-note" role="status" aria-live="polite"><Sparkles size={15} /><span><strong>{filtered.length} برنامجًا</strong> من أصل {programs.length} في دليل الجهة</span>{(query || area !== ALL_AREAS) && <button type="button" onClick={clearFilters}>مسح التصفية</button>}</div>

      {filtered.length ? <div className="program-grid">{filtered.map((program) => {
        const courseNames = getProgramCourses(program);
        const isOfficial = program.verificationStatus === "official-program";
        const status = isOfficial ? "موثق من المصدر الرسمي" : program.verificationStatus === "pending-review" ? "قيد المراجعة" : "دليل استكشافي";
        return <details className="program-card" key={`${program.name}-${program.degree}`}>
          <summary>
            <i><GraduationCap size={21} /></i>
            <span><small>{program.area} · {program.degree}</small><strong>{program.name}</strong><em className={isOfficial ? "official" : ""}>{isOfficial && <BadgeCheck size={13} />}{status}</em></span>
            <span className="program-summary-tail"><b>{courseNames.length} مواد مقترحة</b><ChevronDown size={17} aria-hidden="true" /></span>
          </summary>
          <div className="program-card-body">
            <div className="program-courses-title"><BookOpen size={16} /><div><strong>مواد مرتبطة بالبرنامج</strong><small>للبحث والطلب، وليست بديلًا عن الخطة الدراسية الرسمية.</small></div></div>
            {isOfficial && program.sourceUrl && <a className="catalog-source" href={program.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /><span><strong>فتح مصدر البرنامج الرسمي</strong><small>يفتح في نافذة جديدة</small></span><ArrowLeft size={14} /></a>}
            <div className="program-course-chips">{courseNames.map((course) => <Link key={course} href={`/courses?q=${encodeURIComponent(course)}`}><BookMarked size={13} />{course}</Link>)}</div>
            <footer><p>إذا لم تظهر مادتك في الفهرس، أرسل اسمها أو توصيفها ليصل الطلب إلى فريق المحتوى.</p>{controls.courseRequests ? <Link className="button button-soft" href="/request-course">اطلب شرح مادة <ArrowLeft size={15} /></Link> : <span className="button button-disabled" aria-disabled="true">الطلبات متوقفة مؤقتًا</span>}</footer>
          </div>
        </details>;
      })}</div> : <div className="program-empty"><Search size={27} /><h3>لا توجد نتيجة مطابقة</h3><p>جرّب اسمًا أقصر أو اعرض كل المجالات.</p><button type="button" className="button button-ghost" onClick={clearFilters}>إعادة ضبط البحث</button></div>}
    </section>
  );
}
