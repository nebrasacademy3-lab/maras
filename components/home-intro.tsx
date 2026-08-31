"use client";

import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/brand-logo";

const INTRO_KEY = "meras-home-intro-seen";

export function HomeIntro() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shouldShow = document.documentElement.dataset.homeIntro === "show";
    if (reduced || !shouldShow) {
      const skipTimer = window.setTimeout(() => setVisible(false), 0);
      return () => window.clearTimeout(skipTimer);
    }
    try { sessionStorage.setItem(INTRO_KEY, "1"); } catch { /* storage can be unavailable */ }
    const exitTimer = window.setTimeout(() => setLeaving(true), 1050);
    const removeTimer = window.setTimeout(() => { document.documentElement.dataset.homeIntro = "skip"; setVisible(false); }, 1550);
    return () => { window.clearTimeout(exitTimer); window.clearTimeout(removeTimer); };
  }, []);

  if (!visible) return null;
  return (
    <div className={`home-intro${leaving ? " is-leaving" : ""}`} aria-hidden="true">
      <div className="home-intro-orbit home-intro-orbit-one" />
      <div className="home-intro-orbit home-intro-orbit-two" />
      <div className="home-intro-lockup">
        <BrandLockup />
        <span className="home-intro-tagline">شرح جامعتك، في مكان واحد.</span>
      </div>
      <i className="home-intro-line" />
    </div>
  );
}
