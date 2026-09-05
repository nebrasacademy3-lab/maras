"use client";
import { SearchableSelect } from "@/components/searchable-select";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeSync } from "@/components/realtime-sync";
import Link from "next/link";
import { Check, ChevronDown, Search, SlidersHorizontal, Sparkles, UserRound, X } from "lucide-react";
import type { Course, Institution } from "@/lib/data";
import { CourseCard } from "./course-card";

type ViewerProfile = { universitySlug?: string | null; specialty?: string | null };
type Program = { name: string; degree?: string; aliases?: string[] };
const ALL = "__all__";

export function CourseCatalog({ courses, institutions }: { courses: Course[]; institutions: Institution[] }) {
  const [liveCourses, setLiveCourses] = useState(courses);
  const [liveInstitutions, setLiveInstitutions] = useState(institutions);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get("q") || "";
    if (!initialQuery) return;
    const timer = window.setTimeout(() => setQuery(initialQuery), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const [university, setUniversity] = useState(ALL);
  const [specialty, setSpecialty] = useState(ALL);
  const [sort, setSort] = useState("الأكثر طلبًا");
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsSlug, setProgramsSlug] = useState("");

  useRealtimeSync((payload) => {
    if (payload.changed && !payload.changed.includes("catalog")) return;
    fetch("/api/mobile/catalog", { cache: "no-store" }).then(async (response) => response.ok ? await response.json() as { courses?: Course[]; institutions?: Institution[] } : null).then((payload) => {
      if (payload?.courses) setLiveCourses(payload.courses);
      if (payload?.institutions) setLiveInstitutions(payload.institutions);
    }).catch(() => undefined);
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
      .then(async (response) => response.ok ? await response.json() as { programs?: Program[] } : { programs: [] })
      .then((payload) => { if (!controller.signal.aborted) { setPrograms(payload.programs || []); setProgramsSlug(university); } })
      .catch(() => { if (!controller.signal.aborted) { setPrograms([]); setProgramsSlug(university); } });
    return () => controller.abort();
  }, [university]);

  const universityOptions = useMemo(() => liveInstitutions.map((item) => ({ value: item.slug, label: item.name, detail: `${item.region} · ${item.type}` })).sort((a, b) => a.label.localeCompare(b.label, "ar")), [liveInstitutions]);
  const courseSpecialties = useMemo(() => [...new Set(liveCourses.filter((course) => course.audienceScope !== "institution").map((course) => course.specialty).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar")), [liveCourses]);
  const specialtyOptions = useMemo(() => {
    if (university !== ALL) return [...new Set(programs.flatMap((program) => [program.name, ...(program.aliases || [])]))].sort((a, b) => a.localeCompare(b, "ar"));
    return courseSpecialties;
  }, [courseSpecialties, programs, university]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ar");
    const rows = liveCourses.filter((course) =>
      (!needle || `${course.title} ${course.titleEn} ${course.code || ""} ${course.university} ${course.specialty}`.toLocaleLowerCase("ar").includes(needle)) &&
      (university === ALL || course.universitySlug === university) &&
      (specialty === ALL || course.audienceScope === "institution" || course.specialty === specialty),
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
      <SearchSelect label="الجامعة أو الكلية" value={university} options={[{ value: ALL, label: `كل الجامعات`, detail: `${liveInstitutions.length} جهة تعليمية` }, ...universityOptions]} onChange={chooseUniversity} />
      <SearchSelect label="التخصص" value={specialty} options={[{ value: ALL, label: programsLoading ? "جارٍ تحميل التخصصات..." : university === ALL ? "كل التخصصات" : `كل تخصصات ${selectedUniversity?.name || "الجامعة"}` }, ...specialtyOptions.map((item) => ({ value: item, label: item }))]} onChange={setSpecialty} disabled={programsLoading} />
      <SearchableSelect className="catalog-sort" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="الترتيب"><option>الأكثر طلبًا</option><option>الأعلى تقييمًا</option><option>السعر الأقل</option></SearchableSelect>
      <button type="button" className="filter-reset" onClick={clearFilters} aria-label="مسح الفلاتر"><X size={17} /><span>مسح</span></button><span className="filter-icon"><SlidersHorizontal size={18} /></span>
    </div>
    {university !== ALL && <div className="catalog-filter-selection"><Check size={15} /><span>{selectedUniversity?.name || "الجامعة المختارة"}</span><b>{programsLoading ? "جارٍ جلب التخصصات..." : `${specialtyOptions.length} تخصصًا في الدليل`}</b></div>}
    <p className="results-count">تم العثور على {filtered.length} مادة {personalFilterActive ? "مطابقة لملفك الدراسي" : "من المواد المنشورة فعليًا"}</p>
    {filtered.length ? <div className="courses-grid course-catalog-grid">{filtered.map((course) => <CourseCard key={course.slug} course={course} />)}</div> : <div className="catalog-empty"><Search size={30} /><h3>لم نجد مادة بهذه الفلاتر</h3><p>يمكنك البحث دون فلاتر، أو تغيير الجامعة والتخصص، أو إرسال طلب توفير مادة للجهة المختارة. نستهدف متابعة الطلب من حسابك.</p><div className="catalog-empty-actions"><button type="button" className="button button-ghost" onClick={clearFilters}>مسح الفلاتر</button><Link href="/request-course" className="button button-primary"><Sparkles size={16} /> اطلب توفير المادة</Link></div></div>}
  </>;
}

type PickerOption = { value: string; label: string; detail?: string };
function SearchSelect({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: PickerOption[]; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((item) => item.value === value) || options[0];
  const needle = search.trim().toLocaleLowerCase("ar");
  const rows = options.filter((item) => !needle || `${item.label} ${item.detail || ""}`.toLocaleLowerCase("ar").includes(needle));
  return <div className={`catalog-picker${open ? " open" : ""}`}>
    <button type="button" className="catalog-picker-trigger" disabled={disabled} onClick={() => { setSearch(""); setOpen((current) => !current); }} aria-haspopup="dialog" aria-expanded={open}>
      <span><small>{label}</small><strong>{selected?.label || label}</strong></span><ChevronDown size={16} />
    </button>
    {open && <><button type="button" className="catalog-picker-overlay" aria-label="إغلاق الاختيار" onClick={() => setOpen(false)} /><div className="catalog-picker-popover" role="dialog" aria-label={label}>
      <div className="catalog-picker-head"><span><small>اختر من القائمة</small><strong>{label}</strong></span><button type="button" onClick={() => setOpen(false)} aria-label="إغلاق"><X size={17} /></button></div>
      <label className="catalog-picker-search"><Search size={17} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`ابحث في ${label}`} /></label>
      <div className="catalog-picker-list">{rows.map((item) => <button type="button" key={item.value} className={item.value === value ? "selected" : ""} onClick={() => { onChange(item.value); setOpen(false); setSearch(""); }}><span><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</span>{item.value === value && <Check size={16} />}</button>)}</div>
      {!rows.length && <div className="catalog-picker-empty"><p>لا توجد نتيجة مطابقة. جرّب كلمة أخرى، أو اطلب المادة وتابع حالتها من حسابك.</p><Link href="/request-course" className="button button-primary">طلب مادة · متابعة واضحة</Link></div>}
    </div></>}
  </div>;
}
