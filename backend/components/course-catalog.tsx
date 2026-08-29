"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeSync } from "@/components/realtime-sync";
import Link from "next/link";
import { Check, Search, SlidersHorizontal, Sparkles, UserRound, X } from "lucide-react";
import type { Course, Institution } from "@/lib/data";
import { CourseCard } from "./course-card";

type ViewerProfile = { universitySlug?: string | null; specialty?: string | null };
type Program = { name: string; degree?: string; aliases?: string[] };
const ALL = "__all__";

export function CourseCatalog({ courses, institutions }: { courses: Course[]; institutions: Institution[] }) {
  const initialQuery = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") || "" : "";
  const [liveCourses, setLiveCourses] = useState(courses);
  const [liveInstitutions, setLiveInstitutions] = useState(institutions);
  const [query, setQuery] = useState(initialQuery);
  const [university, setUniversity] = useState(ALL);
  const [specialty, setSpecialty] = useState(ALL);
  const [sort, setSort] = useState("الأكثر طلبًا");
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsSlug, setProgramsSlug] = useState("");
  const [requestsEnabled, setRequestsEnabled] = useState(true);

  useRealtimeSync((payload) => {
    if (payload.changed && !payload.changed.includes("catalog")) return;
    fetch("/api/mobile/catalog", { cache: "no-store" }).then(async (response) => response.ok ? await response.json() as { courses?: Course[]; institutions?: Institution[] } : null).then((payload) => {
      if (payload?.courses) setLiveCourses(payload.courses);
      if (payload?.institutions) setLiveInstitutions(payload.institutions);
    }).catch(() => undefined);
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/settings", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { settings?: { course_requests_enabled?: string } } : null)
      .then((payload) => { if (!controller.signal.aborted) setRequestsEnabled(payload?.settings?.course_requests_enabled !== "false"); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

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
      .then(async (response) => response.ok ? await response.json() as { programs?: Program[] } : { programs: [] })
      .then((payload) => { if (!controller.signal.aborted) { setPrograms(payload.programs || []); setProgramsSlug(university); } })
      .catch(() => { if (!controller.signal.aborted) { setPrograms([]); setProgramsSlug(university); } });
    return () => controller.abort();
  }, [university]);

  const universityOptions = useMemo(() => liveInstitutions.map((item) => [item.slug, item.name] as const).sort((a, b) => a[1].localeCompare(b[1], "ar")), [liveInstitutions]);
  const courseSpecialties = useMemo(() => [...new Set(liveCourses.map((course) => course.specialty).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar")), [liveCourses]);
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

  function showAll() { setUniversity(ALL); setSpecialty(ALL); }
  function showPersonal() { setUniversity(profile?.universitySlug || ALL); setSpecialty(profile?.specialty || ALL); }
  function chooseUniversity(value: string) { setUniversity(value); setSpecialty(ALL); }
  function clearFilters() { setQuery(""); setUniversity(ALL); setSpecialty(ALL); setSort("الأكثر طلبًا"); }

  return <>
    <div className="catalog-filter-context">
      <div><span className="section-kicker">كتالوج موحّد</span><strong>{profileLoaded && profile?.universitySlug ? "رتّبنا لك مواد جامعتك وتخصصك أولًا" : "استكشف مواد الجامعات والتخصصات كلها"}</strong><small>ابحث مباشرة دون فلاتر، أو اختر جامعة لإظهار تخصصاتها كاملة. المواد المعروضة هي المتاح المنشور فعلًا.</small></div>
      <div className="catalog-filter-actions">{profile?.universitySlug && <button type="button" className={personalFilterActive ? "active" : ""} onClick={showPersonal}><UserRound size={14} /> موادي المناسبة</button>}<button type="button" onClick={showAll}>عرض الكل</button></div>
    </div>
    <div className="filter-bar">
      <label className="filter-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم المادة أو رمزها أو الجامعة..." aria-label="بحث المواد" /></label>
      <select value={university} onChange={(event) => chooseUniversity(event.target.value)} aria-label="الجامعة"><option value={ALL}>كل الجامعات ({liveInstitutions.length})</option>{universityOptions.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select>
      <select value={specialty} onChange={(event) => setSpecialty(event.target.value)} aria-label="التخصص" disabled={programsLoading}><option value={ALL}>{programsLoading ? "جارٍ تحميل تخصصات الجامعة..." : university === ALL ? "كل التخصصات" : `كل تخصصات ${selectedUniversity?.name || "الجامعة"}`}</option>{specialtyOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="الترتيب"><option>الأكثر طلبًا</option><option>الأعلى تقييمًا</option><option>السعر الأقل</option></select>
      <button type="button" className="filter-reset" onClick={clearFilters} aria-label="مسح الفلاتر"><X size={17} /><span>مسح</span></button><span className="filter-icon"><SlidersHorizontal size={18} /></span>
    </div>
    {university !== ALL && <div className="catalog-filter-selection"><Check size={15} /><span>{selectedUniversity?.name || "الجامعة المختارة"}</span><b>{programsLoading ? "جارٍ جلب التخصصات..." : `${specialtyOptions.length} تخصصًا في الدليل`}</b></div>}
    <p className="results-count">تم العثور على {filtered.length} مادة {personalFilterActive ? "مطابقة لملفك الدراسي" : "من المواد المنشورة فعليًا"}</p>
    {filtered.length ? <div className="courses-grid course-catalog-grid">{filtered.map((course) => <CourseCard key={course.slug} course={course} />)}</div> : <div className="catalog-empty"><Search size={30} /><h3>لم نجد مادة بهذه الفلاتر</h3><p>{requestsEnabled?"يمكنك البحث دون فلاتر، أو تغيير الجامعة والتخصص، أو إرسال طلب توفير مادة للجهة المختارة.":"يمكنك البحث دون فلاتر أو تغيير الجامعة والتخصص، أو التواصل مع الدعم إذا احتجت مساعدة."}</p><div className="catalog-empty-actions"><button type="button" className="button button-ghost" onClick={clearFilters}>مسح الفلاتر</button>{requestsEnabled?<Link href="/request-course" className="button button-primary"><Sparkles size={16} /> اطلب توفير المادة</Link>:<Link href="/support" className="button button-primary">الدعم الفني</Link>}</div></div>}
  </>;
}
