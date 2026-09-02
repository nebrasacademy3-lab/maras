"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ElementType } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  BellRing,
  BriefcaseBusiness,
  Calculator,
  Check,
  Languages,
  LoaderCircle,
  Presentation,
  Rocket,
  Sparkles,
  Target,
} from "lucide-react";
import type { PublicLearningTrack } from "@/lib/learning-tracks";
import styles from "./home-upcoming-tracks.module.css";

const icons: Record<PublicLearningTrack["iconKey"], ElementType> = {
  languages: Languages,
  briefcase: BriefcaseBusiness,
  calculator: Calculator,
  presentation: Presentation,
  rocket: Rocket,
  target: Target,
  sparkles: Sparkles,
};

const statusLabels: Record<PublicLearningTrack["status"], string> = {
  coming_soon: "قريبًا",
  enrollment_open: "التسجيل مفتوح",
  available: "متاح الآن",
};

function launchLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return "متوقع " + date.toLocaleDateString("ar-SA", { month: "long", year: "numeric" });
}

export function HomeUpcomingTracks({ tracks }: { tracks: PublicLearningTrack[] }) {
  const [activeSlugs, setActiveSlugs] = useState<Set<string>>(() => new Set());
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(tracks.map((track) => [track.slug, track.interestCount])));
  const [busySlug, setBusySlug] = useState("");
  const [message, setMessage] = useState<{ slug: string; text: string; tone: "ok" | "error" } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/learning-tracks/interest", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as { activeSlugs?: string[] };
      setActiveSlugs(new Set(payload.activeSlugs || []));
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const visible = useMemo(() => tracks.slice(0, 6), [tracks]);

  async function toggle(track: PublicLearningTrack) {
    const active = activeSlugs.has(track.slug);
    setBusySlug(track.slug);
    setMessage(null);
    try {
      const response = await fetch("/api/learning-tracks/interest", {
        method: active ? "DELETE" : "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: track.slug, source: "homepage" }),
      });
      const payload = await response.json() as { active?: boolean; interestCount?: number; message?: string; error?: string };
      if (response.status === 401) {
        window.location.assign("/login?return_to=" + encodeURIComponent("/#coming-soon"));
        return;
      }
      if (!response.ok) throw new Error(payload.error || "تعذر حفظ اختيارك");
      const nextActive = payload.active === true;
      setActiveSlugs((current) => {
        const next = new Set(current);
        if (nextActive) next.add(track.slug);
        else next.delete(track.slug);
        return next;
      });
      setCounts((current) => ({
        ...current,
        [track.slug]: typeof payload.interestCount === "number"
          ? payload.interestCount
          : Math.max(0, (current[track.slug] || 0) + (nextActive ? 1 : -1)),
      }));
      setMessage({ slug: track.slug, text: payload.message || (nextActive ? "تم تفعيل التنبيه" : "تم إلغاء التنبيه"), tone: "ok" });
    } catch (error) {
      setMessage({ slug: track.slug, text: error instanceof Error ? error.message : "تعذر حفظ اختيارك", tone: "error" });
    } finally {
      setBusySlug("");
    }
  }

  return (
    <section className={styles.section} id="coming-soon" aria-labelledby="upcoming-title" data-home-reveal>
      <div className={"container " + styles.shell}>
        <header className={styles.heading}>
          <div>
            <span className={styles.kicker}><Sparkles size={15} /> ما نبنيه الآن</span>
            <h2 id="upcoming-title">مراس أكبر من شرح مادة.</h2>
          </div>
          <p>مسارات جديدة للتأسيس واللغة والمهارات والعمل. اختر ما يهمك، وسنرسل لك تحديثًا عند فتح التسجيل أو الإطلاق.</p>
        </header>

        <div className={styles.grid}>
          {visible.map((track, index) => {
            const Icon = icons[track.iconKey] || Sparkles;
            const active = activeSlugs.has(track.slug);
            const direct = track.status !== "coming_soon" && track.destination;
            const date = launchLabel(track.launchAt);
            return (
              <article
                key={track.slug}
                className={styles.card}
                data-accent={track.accent}
                style={{ "--track-index": index } as CSSProperties}
              >
                <div className={styles.cardTop}>
                  <span className={styles.icon}><Icon size={22} /></span>
                  <span className={styles.status} data-status={track.status}><i /> {statusLabels[track.status]}</span>
                </div>
                <div className={styles.cardCopy}>
                  <small>{track.subtitle}</small>
                  <h3>{track.title}</h3>
                  <p>{track.description}</p>
                </div>
                <div className={styles.cardFooter}>
                  <div>
                    {date ? <span>{date}</span> : <span>التفاصيل تُعلن عند الجاهزية</span>}
                    {track.showInterestCount ? <small>{(counts[track.slug] || 0).toLocaleString("ar-SA")} مهتم</small> : null}
                  </div>
                  {direct ? (
                    <Link href={track.destination || "/"}>{track.ctaLabel || "فتح المسار"} <ArrowLeft size={15} /></Link>
                  ) : (
                    <button
                      type="button"
                      className={active ? styles.activeButton : ""}
                      onClick={() => void toggle(track)}
                      disabled={busySlug === track.slug}
                      aria-pressed={active}
                    >
                      {busySlug === track.slug ? <LoaderCircle className={styles.spin} size={16} /> : active ? <Check size={16} /> : <Bell size={16} />}
                      {active ? "سيصلك التنبيه" : track.ctaLabel}
                    </button>
                  )}
                </div>
                {message?.slug === track.slug ? <p className={styles.message} data-tone={message.tone} role="status">{message.text}</p> : null}
              </article>
            );
          })}
        </div>

        <footer className={styles.footer}>
          <span><BellRing size={18} /> اهتماماتك خاصة بحسابك ويمكنك إلغاؤها في أي وقت.</span>
          <Link href="/request-course">لديك اقتراح مختلف؟ أرسله لنا <ArrowLeft size={15} /></Link>
        </footer>
      </div>
    </section>
  );
}
