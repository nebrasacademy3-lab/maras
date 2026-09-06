const STANDARD_TARGETS = [
  ".section-head", ".center-head", ".university-card", ".course-card", ".steps-grid article", ".review-card",
  ".faq-intro", ".faq-item", ".dashboard-panel", ".dashboard-stat-grid article", ".program-card", ".university-identity",
  ".auth-heading", ".auth-form > label", ".auth-proof-card", ".empty-page > div",
  ".content-page > .container > header", ".content-page > .container > article", ".content-page > .container > aside",
  ".catalog-filter-context", ".filter-bar", ".catalog-filter-selection", ".course-detail-copy > *", ".course-detail-art",
  ".course-about-block", ".course-curriculum details", ".learning-points span", ".course-purchase-card",
  ".footer-grid > *", ".footer-app-download", ".footer-store-link", ".checkout-section", ".cart-item",
  ".contact-channel-card", ".contact-social-panel", ".contact-support-panel", ".student-view > *", ".security-feature-icon", ".security-code-field", ".security-password-field", ".admin-stat-card", ".admin-section-head", ".support-ticket", ".notification-day", ".security-form",
  "[data-motion]:not([data-motion='off'])", "[data-home-reveal] article", "[data-home-reveal] aside",
  "[data-home-reveal] [tabindex='0'][aria-label] > *", "#home-intent-panel", "#home-intent-panel ~ :not([aria-hidden='true'])",
].join(",");
const EXCLUDED = "[data-motion='off'],.learning-room,.learning-page,.assistant-panel,.meras-assistant,.secure-player,[role='dialog'],dialog,[popover]";
const PROTECTED_CHILDREN = "video,audio,.secure-player,dialog,[role='dialog'],[popover]";

/** Finite, composited motion only: no fill-forwards, layout changes or persistent containing blocks. */
export function revealTiming(position: number, compact: boolean) {
  return { duration: compact ? 420 : 540, delay: Math.min(Math.max(0, position), 3) * 45, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" as const };
}

export function revealFrames(compact: boolean): Keyframe[] {
  return [
    { opacity: .62, translate: `0 ${compact ? 12 : 18}px` },
    { opacity: .9, offset: .65 },
    { opacity: 1, translate: "none" },
  ];
}

export function collectMotionTargets(root: Document | HTMLElement): HTMLElement[] {
  const document = root.ownerDocument || root as Document;
  const ElementType = document.defaultView?.HTMLElement;
  if (!ElementType) return [];
  const candidates = new Set<HTMLElement>();
  const add = (element: Element) => { if (element instanceof ElementType) candidates.add(element as HTMLElement); };
  if (root instanceof ElementType && root.matches(STANDARD_TARGETS)) add(root);
  root.querySelectorAll(STANDARD_TARGETS).forEach(add);
  const sections = [...root.querySelectorAll<HTMLElement>("[data-home-reveal]")];
  if (root instanceof ElementType && root.matches("[data-home-reveal]")) sections.unshift(root as HTMLElement);
  for (const section of sections) {
    // Semantic hooks also work with CSS Modules: never depend on generated class names.
    const parts = section.querySelectorAll("header, article, aside, [tabindex='0'][aria-label] > *, :scope > .container > div > [href]");
    if (parts.length) parts.forEach(add);
    else section.querySelectorAll(":scope > .container > *").forEach(add);
  }
  const eligible = new Set([...candidates].filter(element => !element.closest(EXCLUDED) && !element.querySelector(PROTECTED_CHILDREN)));
  return [...eligible].filter(element => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) if (eligible.has(parent)) return false;
    return true;
  }).sort((left, right) => left === right ? 0 : left.compareDocumentPosition(right) & 4 ? -1 : 1);
}

export function startMotionOrchestrator(document: Document) {
  const view = document.defaultView;
  if (!view || typeof view.IntersectionObserver !== "function") return () => undefined;
  const preference = view.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => preference.matches || document.documentElement.dataset.motion === "off";
  const seen = new WeakSet<HTMLElement>();
  const waiting = new Set<HTMLElement>();
  const active = new Map<HTMLElement, Animation>();
  const pending = new Set<HTMLElement>();
  let frame = 0;
  let stopped = false;

  const finish = (element: HTMLElement) => {
    waiting.delete(element);
    seen.add(element);
    element.classList.add("is-revealed");
    observer.unobserve(element);
  };
  const reveal = (element: HTMLElement, index: number) => {
    finish(element);
    if (reduced() || typeof element.animate !== "function" || element.closest(EXCLUDED) || element.querySelector(PROTECTED_CHILDREN)) return;
    // Keyboard users must not have a focused form/control moving beneath them.
    if (element.contains(document.activeElement)) return;
    const compact = view.innerWidth < 700;
    try {
      const animation = element.animate(revealFrames(compact), revealTiming(index, compact));
      active.set(element, animation);
      void animation.finished.catch(() => undefined).finally(() => { if (active.get(element) === animation) active.delete(element); });
    } catch { /* A failed visual enhancement must never hide or block content. */ }
  };
  const observer = new view.IntersectionObserver(entries => {
    let position = 0;
    for (const entry of entries) {
      const element = entry.target as HTMLElement;
      if (entry.isIntersecting && waiting.has(element)) reveal(element, position++);
    }
  }, { rootMargin: "0px 0px 12px 0px", threshold: .04 });

  const register = (root: Document | HTMLElement) => {
    for (const element of collectMotionTargets(root)) {
      if (seen.has(element) || waiting.has(element)) continue;
      // Hero CSS starts at first paint. Do not replay it when the deferred JS arrives.
      const box = element.getBoundingClientRect();
      if (element.closest("[aria-labelledby='home-gateway-title']") && box.top < view.innerHeight - 40 && box.bottom > 0) {
        finish(element);
        continue;
      }
      waiting.add(element);
      if (!reduced()) observer.observe(element);
    }
  };
  const onPreference = () => {
    if (reduced()) {
      observer.disconnect();
      active.forEach(animation => animation.cancel());
      active.clear();
    } else {
      // Keep off-screen elements eligible when the preference changes without a navigation.
      for (const element of waiting) if (element.isConnected) observer.observe(element); else waiting.delete(element);
      register(document);
    }
  };
  const onFocus = (event: FocusEvent) => {
    if (!(event.target instanceof view.HTMLElement)) return;
    for (const [element, animation] of active) if (element.contains(event.target)) { animation.cancel(); active.delete(element); }
    for (const element of waiting) if (element.contains(event.target)) finish(element);
  };
  const mutations = new view.MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node instanceof view.HTMLElement) pending.add(node);
    if (frame || stopped) return;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      for (const element of waiting) if (!element.isConnected) { observer.unobserve(element); waiting.delete(element); }
      for (const [element, animation] of active) if (!element.isConnected) { animation.cancel(); active.delete(element); }
      pending.forEach(node => { if (node.isConnected) register(node); });
      pending.clear();
    });
  });
  preference.addEventListener("change", onPreference);
  view.addEventListener("meras:motion-preference", onPreference);
  document.addEventListener("focusin", onFocus);
  register(document);
  mutations.observe(document.body, { childList: true, subtree: true });
  return () => {
    stopped = true;
    observer.disconnect();
    mutations.disconnect();
    preference.removeEventListener("change", onPreference);
    view.removeEventListener("meras:motion-preference", onPreference);
    document.removeEventListener("focusin", onFocus);
    view.cancelAnimationFrame(frame);
    active.forEach(animation => animation.cancel());
    active.clear();
    waiting.clear();
    pending.clear();
  };
}
