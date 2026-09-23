"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import styles from "./skip-to-content.module.css";

/** Prefer the workspace itself; public pages put navigation inside their main. */
export function findSkipDestination(document: Document): HTMLElement | null {
  const workspace = document.querySelector<HTMLElement>("[data-skip-content], .student-content, #admin-workspace, .learning-layout");
  if (workspace) return workspace;
  const main = document.querySelector<HTMLElement>("main");
  if (!main) return null;
  const content = Array.from(main.children).find((element) => !element.matches("header, footer, script, style, .site-header, .site-footer"));
  return content?.namespaceURI === "http://www.w3.org/1999/xhtml" ? content as HTMLElement : main;
}

export function SkipToContent() {
  const pathname = usePathname();
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const destination = findSkipDestination(document);
    if (!destination || !link.current) return;
    const originalId = destination.getAttribute("id");
    const originalTabIndex = destination.getAttribute("tabindex");
    const id = originalId || "maras-main-content";
    if (!originalId) destination.id = id;
    if (originalTabIndex === null) destination.tabIndex = -1;
    link.current.href = `#${id}`;
    return () => {
      if (!originalId && destination.id === id) destination.removeAttribute("id");
      if (originalTabIndex === null && destination.tabIndex === -1) destination.removeAttribute("tabindex");
    };
  }, [pathname]);
  return <a ref={link} className={styles.link} href="#maras-main-content" onClick={(event) => {
    const destination = findSkipDestination(document);
    if (!destination) return;
    event.preventDefault();
    destination.focus({ preventScroll: true });
    destination.scrollIntoView({ block: "start", behavior: "instant" });
  }}>تخطَّ إلى المحتوى الرئيسي</a>;
}
