"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, LoaderCircle } from "lucide-react";

type Review = { id: number; rating: number; body: string; author: string; specialty: string; createdAt: string; verifiedPurchase: boolean };

export function CourseReviews({ courseSlug, catalogRating, catalogCount }: { courseSlug: string; catalogRating: number; catalogCount: number }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => { fetch(`/api/reviews?course=${encodeURIComponent(courseSlug)}`).then(async (response) => await response.json() as { reviews?: Review[] }).then((result) => setReviews(result.reviews || [])).finally(() => setLoading(false)); }, [courseSlug]);
  const rating = reviews.length ? Math.round(reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length * 10) / 10 : catalogRating;
  const count = reviews.length || catalogCount;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage(""); const formElement = event.currentTarget; const form = new FormData(formElement);
    const response = await fetch("/api/reviews", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseSlug, rating: Number(form.get("rating")), body: form.get("body") }) });
    const result = await response.json() as { error?: string; message?: string };
    setMessage(response.ok ? result.message || "وصل تقييمك للمراجعة" : result.error || "تعذر إرسال التقييم");
    if (response.ok) formElement.reset();
  };
  return <section className="course-reviews-block live-course-reviews"><div className="reviews-summary"><div><strong>{rating || "—"}</strong><div className="review-stars">★★★★★</div><span>{count ? `${count} تقييمًا` : "بانتظار أول تقييم موثّق"}</span></div><div className="review-integrity"><BadgeCheck size={20} /><span><strong>آراء شراء موثّقة</strong><small>لا ننشر تقييمات مصطنعة؛ يستطيع الطالب التقييم بعد الشراء وبدء المشاهدة.</small></span></div></div>{loading ? <p className="reviews-loading"><LoaderCircle size={18} className="spin" /> جارٍ تحميل التقييمات...</p> : reviews.length ? <div className="review-cards">{reviews.map((review) => <article key={review.id}><header><span>{review.author[0]}</span><div><strong>{review.author}</strong><small>{review.specialty}</small></div><em>{"★".repeat(review.rating)}</em></header><p>{review.body}</p><footer><BadgeCheck size={14} /> عملية شراء موثّقة · {new Date(review.createdAt).toLocaleDateString("ar-SA")}</footer></article>)}</div> : <p className="review-empty">لا توجد آراء منشورة لهذه المادة بعد. كن أول من يشارك تجربة فعلية بعد بدء التعلم.</p>}<form className="review-form" onSubmit={submit}><div><strong>درست المادة؟ شارك رأيك</strong><small>يتطلب حسابًا بصلاحية شراء وتقدم مشاهدة.</small></div><select name="rating" required defaultValue=""><option value="" disabled>التقييم</option>{[5, 4, 3, 2, 1].map((value) => <option value={value} key={value}>{value} نجوم</option>)}</select><textarea name="body" required minLength={10} maxLength={1200} placeholder="ما الذي ساعدك في التعلم؟" /><button className="button button-soft">إرسال للمراجعة</button>{message && <p>{message}</p>}</form></section>;
}
