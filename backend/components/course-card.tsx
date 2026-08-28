import Link from "next/link";
import { Clock3, PlayCircle, Star } from "lucide-react";
import type { Course } from "@/lib/data";
import { CourseActions } from "./course-actions";
import { CourseCoverImage } from "./course-cover-image";

export function CourseCard({ course, compact = false }: { course: Course; compact?: boolean }) {
  const readyLessons = course.units.flatMap((unit) => unit.lessons).filter((lesson) => lesson.ready);
  const hasReadyPreview = readyLessons.some((lesson) => lesson.free);
  return (
    <article className={`course-card ${compact ? "course-card-compact" : ""}`} aria-labelledby={`course-${course.slug}`}>
      <Link href={`/courses/${course.slug}`} className={`course-cover bg-gradient-to-br ${course.color}`} aria-label={`عرض ${course.title}`}>
        <span className="course-cover-grid" />
        {course.coverImage ? <CourseCoverImage className="course-cover-image" src={course.coverImage} alt="" sizes="(max-width: 520px) 100vw, (max-width: 900px) 50vw, 33vw" /> : <span className="course-cover-icon">{course.icon}</span>}
        <span className={`preview-pill ${hasReadyPreview ? "" : "preparing-pill"}`}>{hasReadyPreview ? <><PlayCircle size={14} /> درس مجاني</> : "قريبًا"}</span>
        {course.oldPrice && <span className="sale-pill">وفر {course.oldPrice - course.price} ر.س</span>}
      </Link>
      <div className="course-card-body">
        <div className="course-context"><span>{course.university}</span><i /> <span>{course.specialty}</span></div>
        <Link href={`/courses/${course.slug}`}><h3 id={`course-${course.slug}`}>{course.title}</h3></Link>
        <p className="course-title-en" dir="ltr">{course.titleEn} {course.code && `· ${course.code}`}</p>
        <div className="course-facts">
          <span><Star size={15} fill="currentColor" /> {course.ratingsCount > 0 ? <>{course.rating} <small>({course.ratingsCount})</small></> : "مادة جديدة"}</span>
          <span><Clock3 size={15} /> {course.duration}</span>
          <span>{readyLessons.length > 0 ? `${readyLessons.length} دروس جاهزة` : `${course.lessons} درسًا مخططًا`}</span>
        </div>
        <div className="course-card-footer">
          <div className="price" aria-label={`السعر ${course.price} ريال سعودي`}><strong>{course.price}</strong><span>ر.س</span>{course.oldPrice && <del>{course.oldPrice}</del>}</div>
          <Link href={`/courses/${course.slug}`} className="button button-soft">التفاصيل والدروس</Link>
        </div>
        <CourseActions courseSlug={course.slug} compact={compact} purchasable={course.availableForPurchase === true} />
      </div>
    </article>
  );
}
