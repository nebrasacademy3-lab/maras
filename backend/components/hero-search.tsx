"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Building2, Search, TrendingUp } from "lucide-react";
import type { Course, Institution } from "@/lib/data";

export function HeroSearch({ courses, institutions, requestsEnabled = true }: { courses: Course[]; institutions: Institution[]; requestsEnabled?: boolean }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const courseResults = courses.filter((c) => `${c.title} ${c.titleEn} ${c.specialty}`.toLowerCase().includes(needle)).slice(0, 3).map((c) => ({ href: `/courses/${c.slug}`, title: c.title, sub: `${c.university} · ${c.specialty}`, type: "course" }));
    const universityResults = institutions.filter((u) => `${u.name} ${u.nameEn}`.toLowerCase().includes(needle)).slice(0, 3).map((u) => ({ href: `/universities/${u.slug}`, title: u.name, sub: `${u.region} · ${u.type}`, type: "university" }));
    return [...courseResults, ...universityResults];
  }, [courses, institutions, query]);

  return (
    <div className="hero-search-wrap">
      <div className="hero-search">
        <Search size={22} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن جامعة، تخصص أو مادة..." aria-label="البحث عن محتوى" />
        <Link href={query ? `/courses?q=${encodeURIComponent(query)}` : "/courses"} className="button button-primary">ابحث الآن <ArrowLeft size={17} /></Link>
      </div>
      {query && (
        <div className="hero-search-results">
          {results.length ? results.map((result) => (
            <Link key={`${result.type}-${result.href}`} href={result.href}>
              <i>{result.type === "course" ? <BookOpen size={17} /> : <Building2 size={17} />}</i>
              <span><strong>{result.title}</strong><small>{result.sub}</small></span>
              <ArrowLeft size={16} />
            </Link>
          )) : requestsEnabled ? (
            <Link href="/request-course"><i><TrendingUp size={17} /></i><span><strong>لم تجد ما تبحث عنه؟</strong><small>اطلب توفير المادة وسنخبرك عند إضافتها</small></span><ArrowLeft size={16} /></Link>
          ) : (
            <Link href="/courses"><i><Search size={17} /></i><span><strong>لا توجد نتيجة مطابقة</strong><small>جرّب كلمة مختلفة أو تصفح جميع المواد</small></span><ArrowLeft size={16} /></Link>
          )}
        </div>
      )}
      <div className="popular-searches"><span>الأكثر بحثًا:</span><Link href="/courses/discrete-structures">هياكل متقطعة</Link><Link href="/courses/java-programming">Java</Link><Link href="/courses/anatomy-1">Anatomy</Link></div>
    </div>
  );
}
