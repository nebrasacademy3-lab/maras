"use client";

import { useEffect, useState } from "react";

export type AcademicProgramOption = { name: string; area: string; degree: string };

export function useAcademicPrograms(institutionSlug: string) {
  const [result, setResult] = useState<{ slug: string; programs: AcademicProgramOption[]; error: string; verified: boolean }>({ slug: "", programs: [], error: "", verified: false });

  useEffect(() => {
    if (!institutionSlug) return;
    const controller = new AbortController();
    fetch(`/api/catalog/programs?institution=${encodeURIComponent(institutionSlug)}`, { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { programs?: AcademicProgramOption[]; error?: string; liveVerified?: boolean };
        if (!response.ok) throw new Error(data.error || "تعذر تحميل التخصصات");
        setResult({ slug: institutionSlug, programs: data.programs || [], error: "", verified: Boolean(data.liveVerified) });
      })
      .catch((caught) => { if ((caught as Error).name !== "AbortError") setResult({ slug: institutionSlug, programs: [], error: caught instanceof Error ? caught.message : "تعذر تحميل التخصصات", verified: false }); });
    return () => controller.abort();
  }, [institutionSlug]);

  if (!institutionSlug) return { programs: [] as AcademicProgramOption[], loading: false, error: "", verified: false };
  return { programs: result.slug === institutionSlug ? result.programs : [], loading: result.slug !== institutionSlug, error: result.slug === institutionSlug ? result.error : "", verified: result.slug === institutionSlug && result.verified };
}
