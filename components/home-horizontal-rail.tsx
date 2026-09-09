"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import styles from "./home-horizontal-rail.module.css";

export function HomeHorizontalRail({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const [edges, setEdges] = useState({ previous: false, next: true });
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const items = Array.from(rail.children);
      const box = rail.getBoundingClientRect();
      const first = items[0]?.getBoundingClientRect();
      const last = items.at(-1)?.getBoundingClientRect();
      const rtl = getComputedStyle(rail).direction === "rtl";
      const previous = !!first && (rtl ? first.right > box.right + 3 : first.left < box.left - 3);
      const next = !!last && (rtl ? last.left < box.left - 3 : last.right > box.right + 3);
      setEdges(current => current.previous === previous && current.next === next ? current : { previous, next });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    schedule();
    rail.addEventListener("scroll", schedule, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(rail);
    return () => { rail.removeEventListener("scroll", schedule); observer?.disconnect(); cancelAnimationFrame(frame); };
  }, [children]);

  const move = (offset: 1 | -1 | "first" | "last") => {
    const rail = railRef.current;
    if (!rail) return;
    const items = Array.from(rail.children).filter((item): item is HTMLElement => item instanceof HTMLElement);
    if (!items.length) return;
    const railBox = rail.getBoundingClientRect();
    const direction = getComputedStyle(rail).direction;
    const startEdge = direction === "rtl" ? railBox.right : railBox.left;
    let currentIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    items.forEach((item, index) => {
      const itemBox = item.getBoundingClientRect();
      const itemStart = direction === "rtl" ? itemBox.right : itemBox.left;
      const distance = Math.abs(itemStart - startEdge);
      if (distance < closestDistance) { closestDistance = distance; currentIndex = index; }
    });
    const targetIndex = offset === "first" ? 0 : offset === "last" ? items.length - 1 : Math.max(0, Math.min(items.length - 1, currentIndex + offset));
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    items[targetIndex]?.scrollIntoView({ behavior, block: "nearest", inline: "start" });
  };
  return (
    <div className={styles.shell + " " + className}>
      <div id={id} ref={railRef} className={styles.rail} role="region" aria-label={label} tabIndex={0} onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move((event.key === "ArrowLeft") === rtl ? 1 : -1); }
        if (event.key === "Home" || event.key === "End") { event.preventDefault(); move(event.key === "Home" ? "first" : "last"); }
      }}>{children}</div>
      <div className={styles.controls} aria-label={"تحريك " + label}>
        <button type="button" onClick={() => move(-1)} aria-controls={id} aria-label={"السابق في " + label} disabled={!edges.previous}><ArrowRight size={18} /></button>
        <button type="button" onClick={() => move(1)} aria-controls={id} aria-label={"التالي في " + label} disabled={!edges.next}><ArrowLeft size={18} /></button>
      </div>
    </div>
  );
}
