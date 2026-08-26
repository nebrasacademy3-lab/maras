import Link from "next/link";
import { Clock3, PlayCircle, Star } from "lucide-react";
import type { Course } from "@/lib/data";

export function CourseCard({ course, compact = false }: { course: Course; compact?: boolean }) {
  return (
    <article className={`course-card ${compact ? "course-card-compact" : ""}`}>
      <Link href={`/courses/${course.slug}`} className={`course-cover bg-gradient-to-br ${course.color}`} aria-label={`عرض ${course.title}`}>
        <span className="course-cover-grid" />
        <span className="course-cover-icon">{course.icon}</span>
        <span className="preview-pill"><PlayCircle size={14} /> درس مجاني</span>
        {course.oldPrice && <span className="sale-pill">وفر {course.oldPrice - course.price} ر.س</span>}
      </Link>
      <div className="course-card-body">
        <div className="course-context"><span>{course.university}</span><i /> <span>{course.specialty}</span></div>
        <Link href={`/courses/${course.slug}`}><h3>{course.title}</h3></Link>
        <p className="course-title-en">{course.titleEn} {course.code && `· ${course.code}`}</p>
        <div className="course-facts">
          <span><Star size={15} fill="currentColor" /> {course.rating} <small>({course.ratingsCount})</small></span>
          <span><Clock3 size={15} /> {course.duration}</span>
          <span>{course.lessons} درسًا</span>
        </div>
        <div className="course-card-footer">
          <div className="price"><strong>{course.price}</strong><span>ر.س</span>{course.oldPrice && <del>{course.oldPrice}</del>}</div>
          <Link href={`/courses/${course.slug}`} className="button button-soft">عرض المادة</Link>
        </div>
      </div>
    </article>
  );
}

