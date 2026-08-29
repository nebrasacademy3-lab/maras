"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Building2, Search, TrendingUp, X } from "lucide-react";
import type { Course, Institution } from "@/lib/data";
import { usePlatformControls } from "./use-platform-controls";

export function HeroSearch({ courses, institutions }: { courses: Course[]; institutions: Institution[] }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const controls = usePlatformControls();
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const courseResults = courses.filter((c) => `${c.title} ${c.titleEn} ${c.specialty}`.toLowerCase().includes(needle)).slice(0, 3).map((c) => ({ href: `/courses/${c.slug}`, title: c.title, sub: `${c.university} · ${c.specialty}`, type: "course" }));
    const universityResults = institutions.filter((u) => `${u.name} ${u.nameEn}`.toLowerCase().includes(needle)).slice(0, 3).map((u) => ({ href: `/universities/${u.slug}`, title: u.name, sub: `${u.region} · ${u.type}`, type: "university" }));
    return [...courseResults, ...universityResults];
  }, [courses, institutions, query]);

  return (
    <div
      className="hero-search-wrap"
      onFocus={() => setFocused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
      onKeyDown={(event) => { if (event.key === "Escape") setFocused(false); }}
    >
      <form className="hero-search" action="/courses" method="get" role="search">
        <Search size={22} aria-hidden="true" />
        <input
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="اكتب اسم الجامعة أو التخصص أو المادة"
          aria-label="البحث عن جامعة أو تخصص أو مادة"
          aria-controls="hero-search-results"
          autoComplete="off"
          enterKeyHint="search"
        />
        {query && <button type="button" className="hero-search-clear" onClick={() => setQuery("")} aria-label="مسح عبارة البحث"><X size={16} /></button>}
        <button type="submit" className="button button-primary">ابحث <ArrowLeft size={17} aria-hidden="true" /></button>
      </form>
      {focused && query && (
        <div className="hero-search-results" id="hero-search-results" aria-live="polite">
          <div className="hero-search-results-head"><span>نتائج مقترحة</span><small>{results.length ? `${results.length} نتائج` : "لا توجد نتيجة مطابقة"}</small></div>
          {results.length ? results.map((result) => (
            <Link key={`${result.type}-${result.href}`} href={result.href}>
              <i>{result.type === "course" ? <BookOpen size={17} /> : <Building2 size={17} />}</i>
              <span><strong>{result.title}</strong><small>{result.sub}</small></span>
              <ArrowLeft size={16} aria-hidden="true" />
            </Link>
          )) : controls.courseRequests ? (
            <Link href="/request-course"><i><TrendingUp size={17} /></i><span><strong>لم تجد ما تبحث عنه؟</strong><small>اطلب توفير المادة وسنخبرك عند إضافتها</small></span><ArrowLeft size={16} /></Link>
          ) : <div className="hero-search-disabled-result"><i><TrendingUp size={17} /></i><span><strong>لم نجد نتيجة مطابقة</strong><small>طلبات المواد متوقفة مؤقتًا، جرّب عبارة أخرى.</small></span></div>}
          {results.length > 0 && <Link href={`/courses?q=${encodeURIComponent(query.trim())}`} className="hero-search-all"><Search size={15} /> عرض كل النتائج لعبارة «{query.trim()}»</Link>}
        </div>
      )}
      <div className="popular-searches" aria-label="عمليات بحث شائعة"><span>بحث سريع:</span><Link href="/courses/discrete-structures">هياكل متقطعة</Link><Link href="/courses/java-programming">Java</Link><Link href="/courses/anatomy-1">Anatomy</Link></div>
    </div>
  );
}
