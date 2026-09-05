"use client";

import { useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import styles from "./home-horizontal-rail.module.css";

export function HomeHorizontalRail({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const move = (offset: 1 | -1) => {
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
    const targetIndex = Math.max(0, Math.min(items.length - 1, currentIndex + offset));
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    items[targetIndex]?.scrollIntoView({ behavior, block: "nearest", inline: "start" });
  };
  return (
    <div className={`${styles.shell} ${className}`}>
      <div ref={railRef} className={styles.rail} aria-label={label} tabIndex={0}>{children}</div>
      <div className={styles.controls} aria-label={`تحريك ${label}`}>
        <button type="button" onClick={() => move(-1)} aria-label="السابق"><ArrowRight size={18} /></button>
        <button type="button" onClick={() => move(1)} aria-label="التالي"><ArrowLeft size={18} /></button>
      </div>
    </div>
  );
}
