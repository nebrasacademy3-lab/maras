"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Heart, LoaderCircle, Trash2 } from "lucide-react";
import type { Course } from "@/lib/data";
import { CourseCard } from "./course-card";
import { setFavorite, syncCommerce } from "./commerce-state";

export function FavoritesClient({ courses }: { courses: Course[] }) {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/favorites", { credentials: "same-origin", cache: "no-store" }).then(async (response) => { const data = await response.json() as { courseSlugs?: string[]; error?: string }; if (!response.ok) throw new Error(data.error || "تعذر تحميل المفضلة"); setSlugs(data.courseSlugs || []); syncCommerce({ favoriteSlugs: data.courseSlugs || [] }); }).catch((caught) => setError(caught instanceof Error ? caught.message : "تعذر تحميل المفضلة")).finally(() => setLoading(false)); }, []);
  const saved = useMemo(() => courses.filter((course) => slugs.includes(course.slug)), [courses, slugs]);
  async function remove(slug: string) { setBusy(slug); try { const data = await setFavorite(slug, false) as { courseSlugs?: string[] }; setSlugs(data.courseSlugs || []); } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر الحذف"); } finally { setBusy(""); } }
  if (loading) return <div className="cart-loading"><LoaderCircle className="spin" size={28} /><p>نستدعي موادك المحفوظة...</p></div>;
  if (!saved.length) return <div className="cart-empty favorites-empty"><div><Heart size={30} /></div><h2>لم تحفظ مواد بعد</h2><p>اضغط على المفضلة في أي بطاقة مادة لتجميع ما تريد مراجعته لاحقًا.</p><Link className="button button-primary" href="/courses">استكشف المواد</Link></div>;
  return <section className="favorites-section"><div className="favorites-head"><div><span className="eyebrow"><Heart size={15} /> {saved.length} محفوظة</span><h2>موادك المفضلة</h2><p>تظل محفوظاتك مرتبطة بحسابك على الويب والتطبيق.</p></div></div>{error && <p className="checkout-error" role="alert">{error}</p>}<div className="courses-grid course-catalog-grid">{saved.map((course) => <div className="favorite-item" key={course.slug}><CourseCard course={course} /><button type="button" className="favorite-remove" onClick={() => void remove(course.slug)} disabled={busy === course.slug}><Trash2 size={14} /> إزالة من المفضلة</button></div>)}</div></section>;
}
