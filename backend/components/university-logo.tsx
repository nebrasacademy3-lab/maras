"use client";

/* eslint-disable @next/next/no-img-element -- institutions use mixed official remote logo sources with graceful fallback */

import { useState } from "react";
import type { Institution } from "@/lib/data";

export function UniversityLogo({ institution, size = "md" }: { institution: Institution; size?: "sm" | "md" | "lg" }) {
  const sources = Array.from(new Set([
    institution.logo?.startsWith("/api/") ? institution.logo : "",
    `/institutions/${institution.slug}.png`,
    institution.logo || "",
    institution.domain ? `https://www.google.com/s2/favicons?domain=${institution.domain}&sz=256` : "",
  ].filter(Boolean)));
  const [sourceIndex, setSourceIndex] = useState(0);
  const src = sources[sourceIndex] || "";
  const initials = institution.name
    .replace(/جامعة|الجامعة|كلية|كليات|الأهلية|للعلوم|التقنية/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <div className={`university-logo university-logo-${size}`} aria-hidden="true">
      {src ? (
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setSourceIndex((index) => index + 1)} />
      ) : (
        <span>{initials || "م"}</span>
      )}
    </div>
  );
}
