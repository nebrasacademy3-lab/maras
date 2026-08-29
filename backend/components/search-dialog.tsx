"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, BookOpen, Building2, RefreshCw, Search, Sparkles, X } from "lucide-react";
import type { Course, Institution } from "@/lib/data";
import { UniversityLogo } from "@/components/university-logo";
import { usePlatformControls } from "@/components/use-platform-controls";

type SearchResults = { universities: Institution[]; courses: Course[] };
type SearchScope = "all" | "courses" | "universities";

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ universities: [], courses: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [retryNonce, setRetryNonce] = useState(0);
  const controls = usePlatformControls();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setQuery(""); setScope("all"); setError(""); onClose(); }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 50);
      document.body.style.overflow = "hidden";
    } else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; previouslyFocused?.focus(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, credentials: "same-origin" });
        if (!response.ok) throw new Error("search");
        setResults(await response.json() as SearchResults);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setError("تعذّر تحميل نتائج البحث الآن. تحقق من الاتصال ثم حاول مجددًا.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, query ? 220 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query, retryNonce]);

  if (!open) return null;
  const showCourses = scope !== "universities";
  const showUniversities = scope !== "courses";
  const empty = (showCourses ? results.courses.length === 0 : true) && (showUniversities ? results.universities.length === 0 : true);
  const resultCount = results.courses.length + results.universities.length;

  return (
    <div className="search-overlay">
      <button className="search-backdrop" onClick={close} aria-label="إغلاق البحث" />
      <div className="search-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="search-dialog-title">
        <div className="search-panel-head">
          <Search size={22} aria-hidden="true" />
          <span id="search-dialog-title" className="sr-only">البحث في مراس العلم</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن جامعة أو تخصص أو مادة"
            aria-label="عبارة البحث"
            aria-controls="search-dialog-results"
            autoComplete="off"
            enterKeyHint="search"
          />
          <button className="icon-button" onClick={close} aria-label="إغلاق"><X size={20} /></button>
        </div>
        <div className="search-scope-tabs" role="tablist" aria-label="نطاق البحث">
          <button type="button" role="tab" aria-selected={scope === "all"} className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>الكل <span>{resultCount}</span></button>
          <button type="button" role="tab" aria-selected={scope === "courses"} className={scope === "courses" ? "active" : ""} onClick={() => setScope("courses")}>المواد <span>{results.courses.length}</span></button>
          <button type="button" role="tab" aria-selected={scope === "universities"} className={scope === "universities" ? "active" : ""} onClick={() => setScope("universities")}>الجامعات <span>{results.universities.length}</span></button>
        </div>
        <div className="search-panel-body" id="search-dialog-results" aria-busy={loading}>
          <div className="search-hint" role="status" aria-live="polite"><span>{query ? `نتائج البحث عن «${query.trim()}»` : "اقتراحات سريعة من فهرس مراس"}</span>{!loading && !error && <small>{resultCount} نتيجة</small>}</div>
          {loading && <div className="search-loading" aria-label="جارٍ تحميل نتائج البحث">{Array.from({ length: 4 }, (_, index) => <span key={index}><i /><b /></span>)}</div>}
          {!loading && error && <div className="search-error" role="alert"><AlertCircle size={28} /><h3>لم نتمكن من إكمال البحث</h3><p>{error}</p><button type="button" className="button button-ghost" onClick={() => setRetryNonce((value) => value + 1)}><RefreshCw size={16} /> إعادة المحاولة</button></div>}
          {!loading && !error && showCourses && results.courses.length > 0 && (
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
          {!loading && !error && showUniversities && results.universities.length > 0 && (
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
          {empty && !loading && !error && query && (
            <div className="search-empty">
              <div><Search size={26} /></div>
              <h3>لم نجد نتيجة مطابقة</h3>
              <p>جرّب اسمًا آخر، أو اطلب منا توفير المادة التي تحتاجها.</p>
              {controls.courseRequests ? <Link href="/request-course" onClick={close} className="button button-primary">اطلب توفير المادة</Link> : <span className="button button-disabled" aria-disabled="true">طلبات المواد متوقفة مؤقتًا</span>}
            </div>
          )}
          {empty && !loading && !error && !query && <div className="search-welcome"><Sparkles size={25} /><h3>ابدأ بما تعرفه</h3><p>اكتب اسم الجامعة أو رمز المادة أو جزءًا من اسم التخصص، وسنرتب النتائج لك.</p></div>}
        </div>
      </div>
    </div>
  );
}
