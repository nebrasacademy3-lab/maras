"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import type { Institution, InstitutionType } from "@/lib/data";
import { UniversityCard } from "./university-card";

export function UniversityCatalog({ institutions }: { institutions: Institution[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"الكل" | InstitutionType>("الكل");
  const [region, setRegion] = useState("كل المناطق");
  const regions = useMemo(() => ["كل المناطق", ...Array.from(new Set(institutions.map((u) => u.region))).sort()], [institutions]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return institutions.filter((item) => {
      const matchesQuery = !needle || `${item.name} ${item.nameEn} ${item.region}`.toLowerCase().includes(needle);
      return matchesQuery && (type === "الكل" || item.type === type) && (region === "كل المناطق" || item.region === region);
    });
  }, [institutions, query, type, region]);

  return (
    <>
      <div className="filter-bar">
        <label className="filter-search"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم الجامعة أو الكلية..." /></label>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="نوع الجهة"><option>الكل</option><option>حكومية</option><option>أهلية</option><option>كلية</option><option>تقنية</option></select>
        <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="المنطقة">{regions.map((value) => <option key={value}>{value}</option>)}</select>
        <span className="filter-icon"><SlidersHorizontal size={18} /></span>
      </div>
      <p className="results-count">نعرض {filtered.length} جهة تعليمية من أصل {institutions.length}</p>
      {filtered.length ? <div className="universities-grid university-catalog-grid">{filtered.map((institution) => <UniversityCard key={institution.slug} institution={institution} />)}</div> : <div className="catalog-empty"><Search size={30} /><h3>لا توجد نتائج مطابقة</h3><p>جرّب تغيير عبارة البحث أو عوامل التصفية.</p></div>}
    </>
  );
}
