/** Browser-only fullscreen helpers. The existing video stays connected and is never cloned. */
type WebkitDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> | void };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type InlineSnapshot = { element: HTMLElement; property: string; value: string; priority: string };

/** Capture before requestFullscreen changes layout or collapses an inline placeholder. */
export function capturePlayerScroll(element: HTMLElement) {
  const document = element.ownerDocument;
  const window = document.defaultView!;
  const position = { x: window.scrollX, y: window.scrollY };
  const parents: { element: HTMLElement; left: number; top: number }[] = [];
  for (let parent = element.parentElement; parent; parent = parent.parentElement) parents.push({ element: parent, left: parent.scrollLeft, top: parent.scrollTop });
  return () => {
    const style = document.documentElement.style;
    const behavior = style.getPropertyValue("scroll-behavior"), priority = style.getPropertyPriority("scroll-behavior");
    style.setProperty("scroll-behavior", "auto", "important");
    for (const parent of parents) if (parent.element.isConnected) { parent.element.scrollLeft = parent.left; parent.element.scrollTop = parent.top; }
    window.scrollTo(position.x, position.y);
    if (behavior) style.setProperty("scroll-behavior", behavior, priority); else style.removeProperty("scroll-behavior");
  };
}

export function currentFullscreenElement(document: Document) {
  return document.fullscreenElement || (document as WebkitDocument).webkitFullscreenElement || null;
}

export function requestPlayerFullscreen(element: HTMLElement) {
  if (element.requestFullscreen) return Promise.resolve(element.requestFullscreen({ navigationUI: "hide" }));
  const legacy = element as WebkitElement;
  if (legacy.webkitRequestFullscreen) return Promise.resolve(legacy.webkitRequestFullscreen());
  return null;
}

export function exitPlayerFullscreen(document: Document) {
  if (document.exitFullscreen) return Promise.resolve(document.exitFullscreen());
  const legacy = document as WebkitDocument;
  return legacy.webkitExitFullscreen ? Promise.resolve(legacy.webkitExitFullscreen()) : Promise.resolve();
}

export function playerViewport(window: Window, native = false) {
  const viewport = native ? null : window.visualViewport;
  return {
    width: Math.max(1, viewport?.width || window.innerWidth),
    height: Math.max(1, viewport?.height || window.innerHeight),
    left: viewport?.offsetLeft || 0,
    top: viewport?.offsetTop || 0,
  };
}

export function watchPlayerViewport(element: HTMLElement, native = false) {
  const window = element.ownerDocument.defaultView!;
  const properties = ["--player-viewport-width", "--player-viewport-height", "--player-viewport-left", "--player-viewport-top"];
  const previous = properties.map(property => ({ property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) }));
  const update = () => {
    const viewport = playerViewport(window, native);
    [viewport.width, viewport.height, viewport.left, viewport.top].forEach((value, index) => element.style.setProperty(properties[index], value + "px"));
  };
  update();
  window.addEventListener("resize", update);
  window.visualViewport?.addEventListener("resize", update);
  window.visualViewport?.addEventListener("scroll", update);
  return () => {
    window.removeEventListener("resize", update);
    window.visualViewport?.removeEventListener("resize", update);
    window.visualViewport?.removeEventListener("scroll", update);
    previous.forEach(({ property, value, priority }) => value ? element.style.setProperty(property, value, priority) : element.style.removeProperty(property));
  };
}

/** Escape containing blocks on older embedded browsers without the top-layer API. */
function escapeAncestorClipping(element: HTMLElement, set: (element: HTMLElement, property: string, value: string) => void) {
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    for (const property of ["transform", "translate", "rotate", "scale", "perspective", "filter", "backdrop-filter", "-webkit-backdrop-filter", "contain"]) set(ancestor, property, "none");
    set(ancestor, "will-change", "auto");
    set(ancestor, "content-visibility", "visible");
    set(ancestor, "overflow", "visible");
    set(ancestor, "clip-path", "none");
    set(ancestor, "animation", "none");
    set(ancestor, "transition", "none");
  }
}

export function enterViewportFullscreen(element: HTMLElement) {
  const document = element.ownerDocument;
  const window = document.defaultView!;
  const snapshots: InlineSnapshot[] = [];
  const set = (target: HTMLElement, property: string, value: string) => {
    snapshots.push({ element: target, property, value: target.style.getPropertyValue(property), priority: target.style.getPropertyPriority(property) });
    target.style.setProperty(property, value, "important");
  };
  const scroll = { x: window.scrollX, y: window.scrollY };
  // Preserve nested lesson scrollers as well as document scroll.
  const scrollParents: { element: HTMLElement; left: number; top: number }[] = [];
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) scrollParents.push({ element: ancestor, left: ancestor.scrollLeft, top: ancestor.scrollTop });
  const previousPopover = element.getAttribute("popover");
  let topLayer = false;
  if (typeof element.showPopover === "function") {
    try { element.setAttribute("popover", "manual"); element.showPopover(); topLayer = true; }
    catch { if (previousPopover === null) element.removeAttribute("popover"); else element.setAttribute("popover", previousPopover); }
  }
  if (!topLayer) escapeAncestorClipping(element, set);
  set(document.documentElement, "scroll-behavior", "auto");
  set(document.documentElement, "overflow", "hidden");
  set(document.body, "overflow", "hidden");
  set(document.body, "position", "fixed");
  set(document.body, "top", -scroll.y + "px");
  set(document.body, "left", -scroll.x + "px");
  set(document.body, "width", "100%");
  set(document.body, "overscroll-behavior", "none");
  const stopViewport = watchPlayerViewport(element);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    stopViewport();
    if (topLayer) {
      try { element.hidePopover(); } catch { /* Detached/closed during navigation. */ }
      if (previousPopover === null) element.removeAttribute("popover"); else element.setAttribute("popover", previousPopover);
    }
    // Restore exact inline declarations, including !important, in reverse order.
    for (const snapshot of snapshots.reverse()) {
      if (snapshot.value) snapshot.element.style.setProperty(snapshot.property, snapshot.value, snapshot.priority);
      else snapshot.element.style.removeProperty(snapshot.property);
    }
    const behavior = document.documentElement.style.getPropertyValue("scroll-behavior");
    const priority = document.documentElement.style.getPropertyPriority("scroll-behavior");
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    for (const parent of scrollParents) if (parent.element.isConnected) { parent.element.scrollLeft = parent.left; parent.element.scrollTop = parent.top; }
    window.scrollTo(scroll.x, scroll.y);
    if (behavior) document.documentElement.style.setProperty("scroll-behavior", behavior, priority); else document.documentElement.style.removeProperty("scroll-behavior");
  };
}
