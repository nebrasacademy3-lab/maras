"use client";
import { SearchableSelect } from "@/components/searchable-select";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, LoaderCircle } from "lucide-react";

type Review = { id: number; rating: number; body: string; author: string; specialty: string; createdAt: string; verifiedPurchase: boolean };

export function CourseReviews({ courseSlug, catalogRating, catalogCount, signedIn = false, canReview = false }: { courseSlug: string; catalogRating: number; catalogCount: number; signedIn?: boolean; canReview?: boolean }) {
  const [loadedReviews, setReviews] = useState<Review[]>([]);
  const [loadedCourse, setLoadedCourse] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const loading = loadedCourse !== courseSlug;
  const reviews = loadedCourse === courseSlug ? loadedReviews : [];
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/reviews?course=${encodeURIComponent(courseSlug)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("reviews-unavailable");
        const result = await response.json() as { reviews?: Review[] };
        if (!result || !Array.isArray(result.reviews)) throw new Error("invalid-reviews-response");
        if (!controller.signal.aborted) { setReviews(result.reviews); setLoadError(""); }
      })
      .catch(() => {
        if (!controller.signal.aborted) { setReviews([]); setLoadError("تعذر تحميل التقييمات الآن. حاول لاحقًا."); }
      })
      .finally(() => { if (!controller.signal.aborted) setLoadedCourse(courseSlug); });
    return () => controller.abort();
  }, [courseSlug]);
  const rating = reviews.length ? Math.round(reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length * 10) / 10 : catalogRating;
  const count = reviews.length || catalogCount;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage(""); const formElement = event.currentTarget; const form = new FormData(formElement);
    try {
      const response = await fetch("/api/reviews", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseSlug, rating: Number(form.get("rating")), body: form.get("body") }) });
      const result = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      if (!response.ok || !result) { setMessage(result?.error || "تعذر إرسال التقييم. حاول لاحقًا."); return; }
      setMessage(result.message || "وصل تقييمك للمراجعة");
      formElement.reset();
    } catch { setMessage("تعذر إرسال التقييم. تحقق من الاتصال وحاول مرة أخرى."); }
  };
  return <section className="course-reviews-block live-course-reviews"><div className="reviews-summary"><div><strong>{rating || "—"}</strong><div className="review-stars">★★★★★</div><span>{count ? `${count} تقييمًا` : "بانتظار أول تقييم موثّق"}</span></div><div className="review-integrity"><BadgeCheck size={20} /><span><strong>آراء شراء موثّقة</strong><small>لا ننشر تقييمات مصطنعة؛ يستطيع الطالب التقييم بعد الشراء وبدء المشاهدة.</small></span></div></div>{loading ? <p className="reviews-loading"><LoaderCircle size={18} className="spin" /> جارٍ تحميل التقييمات...</p> : loadError ? <p className="review-empty" role="status">{loadError}</p> : reviews.length ? <div className="review-cards">{reviews.map((review) => <article key={review.id}><header><span>{review.author[0]}</span><div><strong>{review.author}</strong><small>{review.specialty}</small></div><em>{"★".repeat(review.rating)}</em></header><p>{review.body}</p><footer>{review.verifiedPurchase ? <><BadgeCheck size={14} /> عملية شراء موثّقة</> : "رأي طالب"} · {new Date(review.createdAt).toLocaleDateString("ar-SA")}</footer></article>)}</div> : <p className="review-empty">لا توجد آراء منشورة لهذه المادة بعد. كن أول من يشارك تجربة فعلية بعد بدء التعلم.</p>}{canReview ? <form className="review-form" onSubmit={submit}><div><strong>درست المادة؟ شارك رأيك</strong><small>يُنشر رأيك بعد مراجعة سريعة من فريق مراس.</small></div><SearchableSelect name="rating" required defaultValue=""><option value="" disabled>التقييم</option>{[5, 4, 3, 2, 1].map((value) => <option value={value} key={value}>{value} نجوم</option>)}</SearchableSelect><textarea name="body" required minLength={10} maxLength={1200} placeholder="ما الذي ساعدك في التعلم؟" /><button className="button button-soft">إرسال للمراجعة</button>{message && <p>{message}</p>}</form> : <div className="review-form review-form-locked"><div><strong>درست المادة؟ شارك رأيك</strong><small>{signedIn ? "يمكنك التقييم بعد الاشتراك في المادة وبدء مشاهدة الدروس، حمايةً لمصداقية الآراء." : "سجّل الدخول واشترك في المادة ثم ابدأ المشاهدة لتشارك تقييمك الموثّق."}</small></div>{!signedIn && <Link href={`/login?return_to=${encodeURIComponent(`/courses/${courseSlug}`)}`} className="button button-soft">تسجيل الدخول</Link>}</div>}</section>;
}
