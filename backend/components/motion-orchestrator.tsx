"use client";

import { useEffect } from "react";

const selectors = [
  ".section-head", ".center-head", ".university-card", ".course-card", ".steps-grid article", ".review-card",
  ".faq-item", ".dashboard-panel", ".dashboard-stat-grid article", ".program-card", ".university-identity",
  ".auth-heading", ".auth-form > label", ".auth-proof-card", ".empty-page > div", ".content-page > .container > *",
].join(",");

export function MotionOrchestrator() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.documentElement.classList.add("motion-ready");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("is-revealed"); observer.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -7%", threshold: 0.06 });

    const register = (root: Document | HTMLElement) => {
      root.querySelectorAll<HTMLElement>(selectors).forEach((element, index) => {
        if (element.dataset.motionRegistered) return;
        element.dataset.motionRegistered = "true";
        element.classList.add("motion-reveal");
        element.style.setProperty("--motion-delay", `${Math.min(index % 6, 5) * 45}ms`);
        observer.observe(element);
      });
    };
    register(document);
    const mutations = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => { if (node instanceof HTMLElement) register(node); })));
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutations.disconnect(); document.documentElement.classList.remove("motion-ready"); };
  }, []);
  return null;
}
