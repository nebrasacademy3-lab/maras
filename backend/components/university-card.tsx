import Link from "next/link";
import { ArrowLeft, BadgeCheck, BookOpen, GraduationCap, MapPin } from "lucide-react";
import type { Institution } from "@/lib/data";
import { UniversityLogo } from "./university-logo";

export function UniversityCard({ institution }: { institution: Institution }) {
  const hasPublishedCourses = institution.courses > 0;
  return (
    <Link href={`/universities/${institution.slug}`} className="university-card" aria-label={`فتح صفحة ${institution.name}`}>
      <div className="university-card-head">
        <UniversityLogo institution={institution} />
        <div className="university-card-badges"><span className={`type-pill type-${institution.type}`}>{institution.type}</span>{institution.verificationStatus === "official-directory" && <span className="verified-pill"><BadgeCheck size={12} /> دليل موثق</span>}</div>
      </div>
      <h3>{institution.name}</h3>
      <p dir="ltr">{institution.nameEn}</p>
      <span className="university-region"><MapPin size={14} /> {institution.region}</span>
      <div className="university-card-meta">
        <span><GraduationCap size={15} /> {institution.specialties} تخصصًا</span>
        <span className={hasPublishedCourses ? "has-content" : "preparing-content"}><BookOpen size={15} /> {hasPublishedCourses ? `${institution.courses} مواد منشورة` : "بانتظار أول مادة"}</span>
      </div>
      <div className="university-card-link"><span>عرض التخصصات والمواد</span><i><ArrowLeft size={16} /></i></div>
    </Link>
  );
}
