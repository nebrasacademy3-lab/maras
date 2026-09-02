"use client";

import { useState } from "react";

export function CurriculumExpandAll() {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => {
    const next = !expanded;
    document.querySelectorAll<HTMLDetailsElement>(".course-curriculum details").forEach((element) => { element.open = next; });
    setExpanded(next);
  };
  return <button type="button" className="curriculum-toggle-all" onClick={toggle}>{expanded ? "طيّ الوحدات" : "عرض جميع الوحدات"}</button>;
}
