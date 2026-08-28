"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Search, SlidersHorizontal, Sparkles, UserRound, X } from "lucide-react";
import { useRealtimeSync } from "@/components/realtime-sync";
import { usePlatformControls } from "@/components/use-platform-controls";
import type { Course, Institution } from "@/lib/data";
import { CourseCard } from "./course-card";

type ViewerProfile = { universitySlug?: string | null; specialty?: string | null };
type Program = { name: string; degree?: string; aliases?: string[] };

const ALL = "__all__";

export function CourseCatalog({ courses, institutions }: { courses: Course[]; institutions: Institution[] }) {
  const [liveCourses, setLiveCourses] = useState(courses);
  const [liveInstitutions, setLiveInstitutions] = useState(institutions);
  const [query, setQuery] = useState("");
  const [university, setUniversity] = useState(ALL);
  const [specialty, setSpecialty] = useState(ALL);
  const [sort, setSort] = useState("الأكثر طلبًا");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsSlug, setProgramsSlug] = useState("");
  const [programsError, setProgramsError] = useState(false);
  const [catalogNotice, setCatalogNotice] = useState("");
  const controls = usePlatformControls();

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get("q") || "";
    if (initialQuery) queueMicrotask(() => setQuery(initialQuery));
  }, []);

  useRealtimeSync((payload) => {
    if (payload.changed && !payload.changed.includes("catalog")) return;
    fetch("/api/mobile/catalog", { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { courses?: Course[]; institutions?: Institution[] } : null)
      .then((next) => {
        if (next?.courses) setLiveCourses(next.courses);
        if (next?.institutions) setLiveInstitutions(next.institutions);
        setCatalogNotice("");
      })
      .catch(() => setCatalogNotice("تعذّر تحديث الفهرس لحظيًا؛ ما زالت آخر نسخة محفوظة معروضة."));
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { user?: ViewerProfile } : null)
      .then((payload) => {
        const next = payload?.user || null;
        setProfile(next);
        if (next?.universitySlug) setUniversity(next.universitySlug);
        if (next?.specialty) setSpecialty(next.specialty);
        setProfileLoaded(true);
      })
      .catch(() => setProfileLoaded(true));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (university === ALL) return;
    const controller = new AbortController();
    fetch(`/api/catalog/programs?institution=${encodeURIComponent(university)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { programs?: Program[] } : Promise.reject(new Error("programs")))
      .then((payload) => {
        if (!controller.signal.aborted) { setPrograms(payload.programs || []); setProgramsSlug(university); setProgramsError(false); }
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError") && !controller.signal.aborted) {
          setPrograms([]);
          setProgramsSlug(university);
          setProgramsError(true);
        }
      });
    return () => controller.abort();
  }, [university]);

  const universityOptions = useMemo(
    () => liveInstitutions.map((item) => [item.slug, item.name] as const).sort((a, b) => a[1].localeCompare(b[1], "ar")),
    [liveInstitutions],
  );
  const courseSpecialties = useMemo(
    () => [...new Set(liveCourses.map((course) => course.specialty).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar")),
    [liveCourses],
  );
  const specialtyOptions = useMemo(() => {
    if (university !== ALL) return [...new Set(programs.flatMap((program) => [program.name, ...(program.aliases || [])]))].sort((a, b) => a.localeCompare(b, "ar"));
    return courseSpecialties;
  }, [courseSpecialties, programs, university]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ar");
    const rows = liveCourses.filter((course) =>
      (!needle || `${course.title} ${course.titleEn} ${course.code || ""} ${course.university} ${course.specialty}`.toLocaleLowerCase("ar").includes(needle)) &&
      (university === ALL || course.universitySlug === university) &&
      (specialty === ALL || course.specialty === specialty),
    );
    return [...rows].sort((a, b) => sort === "الأعلى تقييمًا" ? b.rating - a.rating : sort === "السعر الأقل" ? a.price - b.price : b.students - a.students);
  }, [liveCourses, query, university, specialty, sort]);

  const personalFilterActive = Boolean(profile?.universitySlug || profile?.specialty) && university !== ALL;
  const programsLoading = university !== ALL && programsSlug !== university;
  const selectedUniversity = liveInstitutions.find((item) => item.slug === university);
  const activeFilterCount = Number(university !== ALL) + Number(specialty !== ALL);

  function showAll() { setUniversity(ALL); setSpecialty(ALL); setPrograms([]); setProgramsSlug(""); setProgramsError(false); setFiltersOpen(false); }
  function showPersonal() { setUniversity(profile?.universitySlug || ALL); setSpecialty(profile?.specialty || ALL); setProgramsError(false); setFiltersOpen(false); }
  function chooseUniversity(value: string) { setUniversity(value); setSpecialty(ALL); setProgramsError(false); if (value === ALL) { setPrograms([]); setProgramsSlug(""); } }
  function clearFilters() { setQuery(""); setUniversity(ALL); setSpecialty(ALL); setSort("الأكثر طلبًا"); setPrograms([]); setProgramsSlug(""); setProgramsError(false); setFiltersOpen(false); }

  return (
    <section className="catalog-explorer" aria-labelledby="course-catalog-title">
      <header className="catalog-filter-context">
        <div>
          <span className="section-kicker">كتالوج موحّد</span>
          <strong id="course-catalog-title">{profileLoaded && profile?.universitySlug ? "بدأنا بمواد جامعتك وتخصصك" : "كل المواد في بحث واحد واضح"}</strong>
          <small>اكتب ما تعرفه أولًا، ثم افتح الفلاتر إذا احتجت تضييق النتائج.</small>
        </div>
        <div className="catalog-filter-actions">
          {profile?.universitySlug && <button type="button" className={personalFilterActive ? "active" : ""} onClick={showPersonal}><UserRound size={15} /> مواد ملفي</button>}
          <button type="button" onClick={showAll}>عرض الكل</button>
        </div>
      </header>

      <div className="catalog-toolbar">
        <label className="catalog-primary-search">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only">ابحث في المواد</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اسم المادة، رمزها، الجامعة أو التخصص" aria-label="بحث المواد" type="search" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="مسح البحث"><X size={16} /></button>}
        </label>
        <label className="catalog-sort-control"><span>ترتيب النتائج</span><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="ترتيب النتائج"><option>الأكثر طلبًا</option><option>الأعلى تقييمًا</option><option>السعر الأقل</option></select></label>
        <button type="button" className={`catalog-filter-toggle ${filtersOpen ? "active" : ""}`} onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen} aria-controls="course-filter-panel"><SlidersHorizontal size={18} /><span>الفلاتر</span>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button>
      </div>

      {filtersOpen && <div className="catalog-filter-panel" id="course-filter-panel">
        <label><span>الجامعة أو الجهة</span><select value={university} onChange={(event) => chooseUniversity(event.target.value)}><option value={ALL}>كل الجامعات ({liveInstitutions.length})</option>{universityOptions.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select></label>
        <label><span>التخصص</span><select value={specialty} onChange={(event) => setSpecialty(event.target.value)} disabled={programsLoading}><option value={ALL}>{programsLoading ? "جارٍ تحميل التخصصات..." : university === ALL ? "كل التخصصات" : `كل تخصصات ${selectedUniversity?.name || "الجامعة"}`}</option>{specialtyOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>{programsError && <small role="alert">تعذّر جلب دليل التخصصات، ويمكنك متابعة البحث في المواد المنشورة.</small>}</label>
        <button type="button" className="filter-reset" onClick={clearFilters}><X size={16} /> مسح الكل</button>
      </div>}

      {(activeFilterCount > 0 || query) && <div className="active-filter-row" aria-label="الفلاتر النشطة">
        <span>التصفية الحالية:</span>
        {query && <button type="button" onClick={() => setQuery("")}><Search size={13} /> «{query}» <X size={13} /></button>}
        {university !== ALL && <button type="button" onClick={() => chooseUniversity(ALL)}><Check size={13} /> {selectedUniversity?.name || "الجامعة"} <X size={13} /></button>}
        {specialty !== ALL && <button type="button" onClick={() => setSpecialty(ALL)}><Check size={13} /> {specialty} <X size={13} /></button>}
      </div>}

      {catalogNotice && <p className="catalog-inline-notice" role="status">{catalogNotice}</p>}
      <div className="catalog-results-head" role="status" aria-live="polite"><strong>{filtered.length} مادة</strong><span>{personalFilterActive ? "مطابقة لملفك الدراسي" : `من أصل ${liveCourses.length} مادة منشورة`}</span></div>

      {filtered.length ? (
        <div className="courses-grid course-catalog-grid">{filtered.map((course) => <CourseCard key={course.slug} course={course} />)}</div>
      ) : (
        <div className="catalog-empty">
          <Search size={30} />
          <h3>لم نجد مادة بهذه الخيارات</h3>
          <p>امسح بعض الفلاتر أو أرسل طلبًا بالمادة والجامعة والتخصص، وسنخبرك عند توفيرها.</p>
          <div className="catalog-empty-actions"><button type="button" className="button button-ghost" onClick={clearFilters}>إعادة ضبط البحث</button>{controls.courseRequests ? <Link href="/request-course" className="button button-primary"><Sparkles size={16} /> اطلب توفير المادة</Link> : <span className="button button-disabled" aria-disabled="true">طلبات المواد متوقفة مؤقتًا</span>}</div>
        </div>
      )}
    </section>
  );
}
