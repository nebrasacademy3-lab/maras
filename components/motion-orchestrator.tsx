"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const selectors = [
  ".section-head", ".center-head", ".university-card", ".course-card", ".steps-grid article", ".review-card",
  ".faq-item", ".dashboard-panel", ".dashboard-stat-grid article", ".program-card", ".university-identity",
  ".auth-heading", ".auth-form > label", ".auth-proof-card", ".empty-page > div", ".content-page > .container > *",
  ".catalog-filter-context", ".filter-bar", ".catalog-filter-selection", ".course-detail-copy > *", ".course-detail-art",
  ".course-preview-block", ".course-about-block", ".course-curriculum details", ".learning-points span", ".course-purchase-card",
  ".footer-grid > *", ".footer-app-download", ".footer-store-link", ".checkout-section", ".cart-item",
  ".admin-stat-card", ".admin-section-head", ".support-ticket", ".notification-day", ".security-form",
  "[data-home-reveal]", "[data-motion]",
].join(",");

export function MotionOrchestrator() {
  const pathname = usePathname();
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observed = new WeakSet<Element>();
    const animations = new Set<Animation>();
    let index = 0;
    let frame = 0;
    const pending = new Set<HTMLElement>();
    const reveal = (element: HTMLElement) => {
      element.classList.add("is-revealed");
      if (preference.matches || typeof element.animate !== "function" || element.closest("[data-motion='off'],.learning-room,.assistant-panel")) return;
      const duration = Math.min(index++ % 4, 3) * 35 + 380;
      // Content is never hidden while waiting for JS/an observer. No animation fill
      // remains to override hover transforms or trap fixed-position descendants.
      const animation = element.animate([{ opacity: .45, translate: "0 12px" }, { opacity: 1, translate: "0 0" }], { duration, easing: "cubic-bezier(.2,.75,.25,1)" });
      animations.add(animation);
      animation.finished.catch(() => undefined).finally(() => animations.delete(animation));
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { reveal(entry.target as HTMLElement); observer.unobserve(entry.target); }
    }, { rootMargin: "0px 0px -12px", threshold: .02 });
    const registerElement = (element: HTMLElement) => {
      if (observed.has(element)) return;
      observed.add(element);
      if (!preference.matches) observer.observe(element);
    };
    const register = (root: Document | HTMLElement) => {
      if (root instanceof HTMLElement && root.matches(selectors)) registerElement(root);
      root.querySelectorAll<HTMLElement>(selectors).forEach(registerElement);
    };
    const onPreference = () => {
      if (preference.matches) { observer.disconnect(); animations.forEach(animation => animation.cancel()); animations.clear(); }
    };
    preference.addEventListener("change", onPreference);
    register(document);
    const mutations = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement) pending.add(node);
      if (!pending.size || frame) return;
      frame = requestAnimationFrame(() => { frame = 0; pending.forEach(node => { if (node.isConnected) register(node); }); pending.clear(); });
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutations.disconnect(); preference.removeEventListener("change", onPreference); cancelAnimationFrame(frame); animations.forEach(animation => animation.cancel()); };
  }, [pathname]);
  return null;
}
