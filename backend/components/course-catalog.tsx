"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Sparkles } from "lucide-react";
import type { Course } from "@/lib/data";
import { CourseCard } from "./course-card";

export function CourseCatalog({ courses }: { courses: Course[] }) {
  const initialQuery = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") || "" : "";
  const [query, setQuery] = useState(initialQuery);
  const [specialty, setSpecialty] = useState("كل التخصصات");
  const [sort, setSort] = useState("الأكثر طلبًا");
  const specialties = useMemo(() => [...new Set(courses.map((course) => course.specialty).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar")), [courses]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = courses.filter((course) => (!needle || `${course.title} ${course.titleEn} ${course.code || ""} ${course.university} ${course.specialty}`.toLowerCase().includes(needle)) && (specialty === "كل التخصصات" || course.specialty === specialty));
    return [...rows].sort((a, b) => sort === "الأعلى تقييمًا" ? b.rating - a.rating : sort === "السعر الأقل" ? a.price - b.price : b.students - a.students);
  }, [courses, query, specialty, sort]);
  return <>
    <div className="filter-bar"><label className="filter-search"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم المادة أو رمزها..." /></label><select value={specialty} onChange={(e) => setSpecialty(e.target.value)} aria-label="التخصص"><option>كل التخصصات</option>{specialties.map((item) => <option key={item}>{item}</option>)}</select><select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="الترتيب"><option>الأكثر طلبًا</option><option>الأعلى تقييمًا</option><option>السعر الأقل</option></select><span className="filter-icon"><SlidersHorizontal size={18} /></span></div>
    <p className="results-count">تم العثور على {filtered.length} مادة</p>
    {filtered.length ? <div className="courses-grid course-catalog-grid">{filtered.map((course) => <CourseCard key={course.slug} course={course} />)}</div> : <div className="catalog-empty"><Search size={30} /><h3>لم نجد المادة</h3><p>أرسل لنا طلب توفيرها وسنخبرك فور بدء تجهيز الشرح.</p><Link href="/request-course" className="button button-primary"><Sparkles size={16} /> اطلب توفير المادة</Link></div>}
  </>;
}
