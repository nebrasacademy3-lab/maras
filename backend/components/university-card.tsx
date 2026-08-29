import Link from "next/link";
import { ArrowLeft, BookOpen, GraduationCap } from "lucide-react";
import type { Institution } from "@/lib/data";
import { UniversityLogo } from "./university-logo";

export function UniversityCard({ institution }: { institution: Institution }) {
  return (
    <Link href={`/universities/${institution.slug}`} className="university-card">
      <div className="university-card-head">
        <UniversityLogo institution={institution} />
        <span className={`type-pill type-${institution.type}`}>{institution.type}</span>
      </div>
      <h3>{institution.name}</h3>
      <p>{institution.nameEn}</p>
      <div className="university-card-meta">
        <span><GraduationCap size={15} /> {institution.specialties} تخصصًا</span>
        <span><BookOpen size={15} /> {institution.courses ? `${institution.courses} مواد` : "لا مواد منشورة"}</span>
      </div>
      <div className="university-card-link">عرض الجامعة <ArrowLeft size={16} /></div>
    </Link>
  );
}

