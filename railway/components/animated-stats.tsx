"use client";

import { useEffect, useState } from "react";

type Stat = { value: number | string; label: string };

export function AnimatedStats({ items }: { items: Stat[] }) {
  const [values, setValues] = useState<Array<number | string>>(() => items.map((item) => typeof item.value === "number" ? 0 : item.value));

  useEffect(() => {
    const numeric = items.map((item) => typeof item.value === "number");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setValues(items.map((item) => item.value)));
      return () => cancelAnimationFrame(frame);
    }
    let frame = 0;
    const start = performance.now();
    const duration = 1050;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValues(items.map((item, index) => numeric[index] ? Math.round(Number(item.value) * eased) : item.value));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [items]);

  return <div className="stats-strip" role="group" aria-label="إحصائيات المنصة">{items.map((item, index) => <div key={item.label}><strong>{typeof values[index] === "number" ? Number(values[index]).toLocaleString("ar-SA") : values[index]}</strong><span>{item.label}</span></div>)}</div>;
}
