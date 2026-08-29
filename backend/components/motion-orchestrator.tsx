"use client";

import { useEffect } from "react";

const selectors = [
  ".section-head", ".center-head", ".university-card", ".course-card", ".steps-grid article", ".review-card",
  ".faq-item", ".dashboard-panel", ".dashboard-stat-grid article", ".program-card", ".university-identity",
  ".auth-heading", ".auth-form > label", ".auth-proof-card", ".empty-page > div", ".content-page > .container > *",
  ".catalog-filter-context", ".catalog-toolbar", ".catalog-results-head", ".experience-card", ".request-banner",
].join(",");

export function MotionOrchestrator() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.documentElement.classList.add("motion-ready");
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll<HTMLElement>(selectors).forEach((element) => element.classList.add("motion-reveal", "is-revealed"));
      return () => document.documentElement.classList.remove("motion-ready");
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("is-revealed"); observer.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -6%", threshold: 0.05 });

    const register = (root: Document | HTMLElement) => {
      const elements = root instanceof HTMLElement && root.matches(selectors)
        ? [root, ...root.querySelectorAll<HTMLElement>(selectors)]
        : [...root.querySelectorAll<HTMLElement>(selectors)];
      elements.forEach((element, index) => {
        if (element.dataset.motionRegistered) return;
        element.dataset.motionRegistered = "true";
        element.classList.add("motion-reveal");
        element.style.setProperty("--motion-delay", `${Math.min(index % 5, 4) * 42}ms`);
        const rect = element.getBoundingClientRect();
        if (rect.top < window.innerHeight * .92 && rect.bottom > 0) element.classList.add("is-revealed");
        else observer.observe(element);
      });
    };
    register(document);
    const mutations = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => { if (node instanceof HTMLElement) register(node); })));
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutations.disconnect(); document.documentElement.classList.remove("motion-ready"); };
  }, []);
  return null;
}
