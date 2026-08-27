"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Sparkles, UserRound } from "lucide-react";
import type { Course } from "@/lib/data";
import { CourseCard } from "./course-card";

type ViewerProfile = { universitySlug?: string | null; specialty?: string | null };

export function CourseCatalog({ courses }: { courses: Course[] }) {
  const initialQuery = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") || "" : "";
  const [query, setQuery] = useState(initialQuery);
  const [university, setUniversity] = useState("كل الجامعات");
  const [specialty, setSpecialty] = useState("كل التخصصات");
  const [sort, setSort] = useState("الأكثر طلبًا");
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

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

  const universities = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((course) => { if (course.universitySlug && course.university) map.set(course.universitySlug, course.university); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ar"));
  }, [courses]);
  const specialties = useMemo(() => [...new Set(courses.map((course) => course.specialty).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar")), [courses]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ar");
    const rows = courses.filter((course) =>
      (!needle || `${course.title} ${course.titleEn} ${course.code || ""} ${course.university} ${course.specialty}`.toLocaleLowerCase("ar").includes(needle)) &&
      (university === "كل الجامعات" || course.universitySlug === university) &&
      (specialty === "كل التخصصات" || course.specialty === specialty),
    );
    return [...rows].sort((a, b) => sort === "الأعلى تقييمًا" ? b.rating - a.rating : sort === "السعر الأقل" ? a.price - b.price : b.students - a.students);
  }, [courses, query, university, specialty, sort]);
  const personalFilterActive = Boolean(profile?.universitySlug || profile?.specialty) && university !== "كل الجامعات";

  function showAll() {
    setUniversity("كل الجامعات");
    setSpecialty("كل التخصصات");
  }

  function showPersonal() {
    setUniversity(profile?.universitySlug || "كل الجامعات");
    setSpecialty(profile?.specialty || "كل التخصصات");
  }

  return <>
    <div className="catalog-filter-context">
      <div><span className="section-kicker">كتالوج موحّد</span><strong>{profileLoaded && profile?.universitySlug ? "رتّبنا لك مواد جامعتك وتخصصك أولًا" : "استكشف مواد الجامعات والتخصصات كلها"}</strong><small>يمكنك تغيير الفلاتر في أي وقت، والبيانات المعروضة مشتركة بين الويب والتطبيق.</small></div>
      <div className="catalog-filter-actions">{profile?.universitySlug && <button type="button" className={personalFilterActive ? "active" : ""} onClick={showPersonal}><UserRound size={14} /> موادي المناسبة</button>}<button type="button" onClick={showAll}>عرض الكل</button></div>
    </div>
    <div className="filter-bar">
      <label className="filter-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم المادة أو رمزها أو الجامعة..." aria-label="بحث المواد" /></label>
      <select value={university} onChange={(event) => setUniversity(event.target.value)} aria-label="الجامعة"><option>كل الجامعات</option>{universities.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select>
      <select value={specialty} onChange={(event) => setSpecialty(event.target.value)} aria-label="التخصص"><option>كل التخصصات</option>{specialties.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="الترتيب"><option>الأكثر طلبًا</option><option>الأعلى تقييمًا</option><option>السعر الأقل</option></select><span className="filter-icon"><SlidersHorizontal size={18} /></span>
    </div>
    <p className="results-count">تم العثور على {filtered.length} مادة {personalFilterActive ? "مطابقة لملفك الدراسي" : "في الكتالوج المتاح"}</p>
    {filtered.length ? <div className="courses-grid course-catalog-grid">{filtered.map((course) => <CourseCard key={course.slug} course={course} />)}</div> : <div className="catalog-empty"><Search size={30} /><h3>لم نجد مادة بهذه الفلاتر</h3><p>غيّر الجامعة أو التخصص أو اعرض الكتالوج كاملًا، ويمكنك أيضًا إرسال طلب توفير مادة.</p><div className="catalog-empty-actions"><button type="button" className="button button-ghost" onClick={showAll}>عرض كل المواد</button><Link href="/request-course" className="button button-primary"><Sparkles size={16} /> اطلب توفير المادة</Link></div></div>}
  </>;
}
