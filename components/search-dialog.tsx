"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Building2, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { EMPTY_CATALOG_SEARCH, parseCatalogSearchResults, type CatalogSearchResults } from "@/lib/catalog-search";
import { UniversityLogo } from "@/components/university-logo";
import styles from "./search-dialog.module.css";

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogSearchResults>(EMPTY_CATALOG_SEARCH);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = () => { setQuery(""); onClose(); };

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    inputRef.current?.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, credentials: "same-origin" });
        if (!response.ok) throw new Error("تعذر تحميل النتائج الآن. حاول مرة أخرى أو تصفح المواد.");
        const parsed = parseCatalogSearchResults(await response.json());
        if (!controller.signal.aborted) setResults(parsed);
      } catch {
        if (active) { setResults(EMPTY_CATALOG_SEARCH); setError("تعذر الاتصال بالبحث. تحقق من الاتصال ثم حاول مرة أخرى."); }
      } finally {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }, query ? 180 : 0);
    let active = true;
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [open, query, attempt]);

  if (!open) return null;
  const count = results.institutions.length + results.courses.length;
  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="catalog-search-title" dir="rtl" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={styles.panel}>
      <header className={styles.heading}><span><Search size={18} /><strong id="catalog-search-title">اكتشف ما تحتاجه لدراستك</strong></span><button type="button" className="icon-button" onClick={close} aria-label="إغلاق البحث"><X size={20} /></button></header>
      <form className={styles.search} action="/courses" method="get" role="search" onSubmit={event => { event.preventDefault(); const destination = `/courses?q=${encodeURIComponent(query.trim())}`; close(); router.push(destination); }}><Search size={21} aria-hidden="true" /><input ref={inputRef} name="q" value={query} maxLength={160} onChange={event => { setQuery(event.target.value); setLoading(true); setError(""); }} placeholder="اسم المادة، رمزها أو جامعتك…" aria-label="عبارة البحث" autoComplete="off" enterKeyHint="search" /><button className="button button-primary" type="submit" aria-label="عرض كل نتائج البحث"><ArrowLeft size={19} /></button></form>
      <div className={styles.status} role="status" aria-live="polite">{loading ? <><LoaderCircle size={16} className={styles.spinner} /> جارٍ البحث…</> : error ? "البحث غير متاح مؤقتًا" : query.trim() ? count ? `${count} نتائج مقترحة` : "لا توجد نتائج مطابقة" : "ابدأ من هذه الاقتراحات"}</div>
      <div className={styles.body} aria-busy={loading}>
        {error ? <div className={styles.empty}><Search size={28} /><h2>لنجرّب مرة أخرى</h2><p role="alert">{error}</p><button type="button" className="button button-primary" onClick={() => { setLoading(true); setAttempt(value => value + 1); }}><RefreshCw size={16} /> إعادة المحاولة</button><Link href="/courses" onClick={close}>تصفح جميع المواد</Link></div> : loading ? <div className={styles.skeleton} aria-hidden="true"><span /><span /><span /></div> : <>
          {results.courses.length > 0 && <section className={styles.group}><h2><BookOpen size={16} /> المواد</h2>{results.courses.map(course => <Link key={course.slug} href={`/courses/${encodeURIComponent(course.slug)}`} onClick={close} className={styles.result}><span className={`${styles.courseIcon} bg-gradient-to-br ${course.color}`}>{course.icon || <BookOpen size={22} />}</span><span className={styles.copy}><strong>{course.title}</strong><small>{[course.titleEn, course.university].filter(Boolean).join(" · ")}</small></span><ArrowLeft size={17} /></Link>)}</section>}
          {results.institutions.length > 0 && <section className={styles.group}><h2><Building2 size={16} /> الجامعات والكليات</h2>{results.institutions.map(institution => <Link key={institution.slug} href={`/universities/${encodeURIComponent(institution.slug)}`} onClick={close} className={styles.result}><UniversityLogo institution={institution} size="sm" /><span className={styles.copy}><strong>{institution.name}</strong><small>{[institution.region, institution.type].filter(Boolean).join(" · ")}</small></span><ArrowLeft size={17} /></Link>)}</section>}
          {count === 0 && <div className={styles.empty}><Search size={28} /><h2>لم نجد نتيجة مطابقة</h2><p>جرّب اسمًا مختصرًا أو رمز المادة. يمكنك أيضًا طلب توفير مادة جديدة ومتابعتها من حسابك.</p><Link href="/request-course" onClick={close} className="button button-primary">اطلب توفير المادة</Link></div>}
        </>}
      </div>
      <footer className={styles.footer}><span>مادتك أقرب مما تتوقع</span><Link href="/courses" onClick={close}>كل المواد <ArrowLeft size={15} /></Link></footer>
    </div>
  </dialog>;
}
