"use client";

import { useMemo, useState } from "react";
import { MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import type { Institution, InstitutionType } from "@/lib/data";
import { UniversityCard } from "./university-card";

const ALL_TYPES = "الكل";
const ALL_REGIONS = "كل المناطق";

export function UniversityCatalog({ institutions }: { institutions: Institution[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<typeof ALL_TYPES | InstitutionType>(ALL_TYPES);
  const [region, setRegion] = useState(ALL_REGIONS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const regions = useMemo(() => [ALL_REGIONS, ...Array.from(new Set(institutions.map((item) => item.region))).sort((a, b) => a.localeCompare(b, "ar"))], [institutions]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ar");
    return institutions.filter((item) => {
      const matchesQuery = !needle || `${item.name} ${item.nameEn} ${item.region} ${item.domain || ""}`.toLocaleLowerCase("ar").includes(needle);
      return matchesQuery && (type === ALL_TYPES || item.type === type) && (region === ALL_REGIONS || item.region === region);
    });
  }, [institutions, query, type, region]);
  const activeFilterCount = Number(type !== ALL_TYPES) + Number(region !== ALL_REGIONS);

  function clearFilters() {
    setQuery("");
    setType(ALL_TYPES);
    setRegion(ALL_REGIONS);
    setFiltersOpen(false);
  }

  return (
    <section className="catalog-explorer university-explorer" aria-labelledby="university-catalog-title">
      <div className="catalog-toolbar university-toolbar">
        <label className="catalog-primary-search">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only" id="university-catalog-title">البحث في الجامعات والكليات</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اسم الجامعة أو الكلية أو المنطقة" aria-label="البحث في الجامعات والكليات" type="search" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="مسح البحث"><X size={16} /></button>}
        </label>
        <button type="button" className={`catalog-filter-toggle ${filtersOpen ? "active" : ""}`} onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen} aria-controls="university-filter-panel"><SlidersHorizontal size={18} /><span>تصفية الجهات</span>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button>
      </div>

      {filtersOpen && <div className="catalog-filter-panel university-filter-panel" id="university-filter-panel">
        <label><span>نوع الجهة</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option>{ALL_TYPES}</option><option>حكومية</option><option>أهلية</option><option>كلية</option><option>تقنية</option></select></label>
        <label><span>المنطقة</span><select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((value) => <option key={value}>{value}</option>)}</select></label>
        <button type="button" className="filter-reset" onClick={clearFilters}><X size={16} /> مسح الكل</button>
      </div>}

      {(query || activeFilterCount > 0) && <div className="active-filter-row" aria-label="الفلاتر النشطة">
        <span>التصفية الحالية:</span>
        {query && <button type="button" onClick={() => setQuery("")}><Search size={13} /> «{query}» <X size={13} /></button>}
        {type !== ALL_TYPES && <button type="button" onClick={() => setType(ALL_TYPES)}>{type} <X size={13} /></button>}
        {region !== ALL_REGIONS && <button type="button" onClick={() => setRegion(ALL_REGIONS)}><MapPin size={13} /> {region} <X size={13} /></button>}
      </div>}

      <div className="catalog-results-head" role="status" aria-live="polite"><strong>{filtered.length} جهة تعليمية</strong><span>من أصل {institutions.length} جهة في الدليل</span></div>
      {filtered.length ? (
        <div className="universities-grid university-catalog-grid">{filtered.map((institution) => <UniversityCard key={institution.slug} institution={institution} />)}</div>
      ) : (
        <div className="catalog-empty"><Search size={30} /><h3>لا توجد جهة مطابقة</h3><p>جرّب اسمًا أقصر أو امسح المنطقة ونوع الجهة.</p><button type="button" className="button button-primary" onClick={clearFilters}>إعادة ضبط البحث</button></div>
      )}
    </section>
  );
}
