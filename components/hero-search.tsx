"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Building2, Search, TrendingUp } from "lucide-react";

export type SearchCourse = {
  slug: string;
  title: string;
  titleEn: string;
  university: string;
  specialty: string;
};

export type SearchInstitution = {
  slug: string;
  name: string;
  nameEn: string;
  region: string;
  type: string;
};

type SearchResult = {
  href: string;
  title: string;
  sub: string;
  type: "course" | "university" | "request";
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLocaleLowerCase("ar");
}

export function HeroSearch({
  courses,
  institutions,
}: {
  courses: SearchCourse[];
  institutions: SearchInstitution[];
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const resultsId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const results = useMemo<SearchResult[]>(() => {
    const needle = normalizeSearch(query.trim());
    if (!needle) return [];

    const courseResults: SearchResult[] = courses
      .filter((course) =>
        normalizeSearch([course.title, course.titleEn, course.university, course.specialty].join(" ")).includes(needle),
      )
      .slice(0, 3)
      .map((course) => ({
        href: "/courses/" + course.slug,
        title: course.title,
        sub: course.university + " · " + course.specialty,
        type: "course",
      }));

    const universityResults: SearchResult[] = institutions
      .filter((institution) =>
        normalizeSearch([institution.name, institution.nameEn, institution.region, institution.type].join(" ")).includes(needle),
      )
      .slice(0, 3)
      .map((institution) => ({
        href: "/universities/" + institution.slug,
        title: institution.name,
        sub: institution.region + " · " + institution.type,
        type: "university",
      }));

    return [...courseResults, ...universityResults];
  }, [courses, institutions, query]);

  const visibleResults: SearchResult[] = results.length
    ? results
    : [{
        href: "/request-course",
        title: "لم تجد ما تبحث عنه؟",
        sub: "اطلب توفير المادة وتابع حالتها من حسابك.",
        type: "request",
      }];
  const showResults = open && query.trim().length > 0;

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        if (event.key === "ArrowDown") return (current + 1) % visibleResults.length;
        return current <= 0 ? visibleResults.length - 1 : current - 1;
      });
      return;
    }

    if (event.key === "Enter" && showResults && activeIndex >= 0) {
      event.preventDefault();
      router.push(visibleResults[activeIndex].href);
      setOpen(false);
    }
  }

  return (
    <div className="hero-search-wrap" ref={rootRef}>
      <form className="hero-search" action="/courses" method="get" onSubmit={() => setOpen(false)} role="search">
        <Search size={22} aria-hidden="true" />
        <input
          name="q"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          placeholder="ابحث عن جامعة، تخصص أو مادة..."
          aria-label="البحث عن جامعة أو تخصص أو مادة"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={showResults}
          aria-controls={resultsId}
          aria-activedescendant={showResults && activeIndex >= 0 ? resultsId + "-" + activeIndex : undefined}
          autoComplete="off"
        />
        <button type="submit" className="button button-primary">
          ابحث الآن <ArrowLeft size={17} aria-hidden="true" />
        </button>
      </form>

      {showResults && (
        <div className="hero-search-results" id={resultsId} role="listbox" aria-label="نتائج البحث المقترحة">
          {visibleResults.map((result, index) => {
            const Icon = result.type === "course" ? BookOpen : result.type === "university" ? Building2 : TrendingUp;
            return (
              <Link
                key={result.type + "-" + result.href}
                id={resultsId + "-" + index}
                href={result.href}
                role="option"
                aria-selected={activeIndex === index}
                tabIndex={-1}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => setOpen(false)}
              >
                <i><Icon size={17} aria-hidden="true" /></i>
                <span>
                  <strong><bdi dir="auto">{result.title}</bdi></strong>
                  <small><bdi dir="auto">{result.sub}</bdi></small>
                </span>
                <ArrowLeft size={16} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
