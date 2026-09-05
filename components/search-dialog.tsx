"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Building2, Search, X, ArrowLeft } from "lucide-react";
import type { Course, Institution } from "@/lib/data";
import { UniversityLogo } from "@/components/university-logo";

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ universities: Institution[]; courses: Course[] }>({ universities: [], courses: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => { setQuery(""); onClose(); }, [onClose]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 50);
      document.body.style.overflow = "hidden";
    } else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, credentials: "same-origin" });
        if (!response.ok) throw new Error("search");
        setResults(await response.json() as { universities: Institution[]; courses: Course[] });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setResults({ universities: [], courses: [] });
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, query ? 180 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query]);

  if (!open) return null;
  const empty = results.universities.length === 0 && results.courses.length === 0;

  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label="البحث في مراس">
      <button className="search-backdrop" onClick={close} aria-label="إغلاق البحث" />
      <div className="search-panel">
        <div className="search-panel-head">
          <Search size={22} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن جامعة، تخصص أو مادة..."
            aria-label="عبارة البحث"
          />
          <button className="icon-button" onClick={close} aria-label="إغلاق"><X size={20} /></button>
        </div>
        <div className="search-panel-body">
          {!query && <p className="search-hint">{loading ? "جارٍ تحميل الفهرس..." : "اقتراحات سريعة تساعدك تبدأ"}</p>}
          {results.courses.length > 0 && (
            <div className="search-group">
              <div className="search-group-title"><BookOpen size={16} /> المواد</div>
              {results.courses.map((course) => (
                <Link key={course.slug} href={`/courses/${course.slug}`} onClick={close} className="search-result">
                  <span className={`course-mini-icon bg-gradient-to-br ${course.color}`}>{course.icon}</span>
                  <span><strong>{course.title}</strong><small>{course.titleEn} · {course.university}</small></span>
                  <ArrowLeft size={18} />
                </Link>
              ))}
            </div>
          )}
          {results.universities.length > 0 && (
            <div className="search-group">
              <div className="search-group-title"><Building2 size={16} /> الجامعات والكليات</div>
              {results.universities.map((university) => (
                <Link key={university.slug} href={`/universities/${university.slug}`} onClick={close} className="search-result">
                  <span className="search-logo-fallback"><UniversityLogo institution={university} /></span>
                  <span><strong>{university.name}</strong><small>{university.region} · {university.type}</small></span>
                  <ArrowLeft size={18} />
                </Link>
              ))}
            </div>
          )}
          {empty && !loading && (
            <div className="search-empty">
              <div><Search size={26} /></div>
              <h3>لم نجد نتيجة مطابقة</h3>
              <p>جرّب اسمًا آخر، أو اطلب منا توفير المادة التي تحتاجها. سنحدّث حالة الطلب من حسابك.</p>
              <Link href="/request-course" onClick={close} className="button button-primary">اطلب توفير المادة</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
