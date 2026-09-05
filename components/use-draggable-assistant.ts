"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type MouseEvent } from "react";

type Point = { x: number; y: number };
type Bounds = { left: number; top: number; right: number; bottom: number; width: number; height: number; size: number };
const STORAGE_KEY = "meras-assistant-position-v1";
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(min, max), Math.max(min, value));

export function useDraggableAssistant() {
  const button = useRef<HTMLButtonElement>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [dragging, setDragging] = useState(false);
  const current = useRef<Point | null>(null);
  const limits = useRef<Bounds | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ pointer: number; startX: number; startY: number; start: Point; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const persist = useCallback((position: Point, area: Bounds) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: (position.x - area.left) / Math.max(1, area.right - area.left), y: (position.y - area.top) / Math.max(1, area.bottom - area.top) })); } catch { /* Position remains usable without browser storage. */ }
  }, []);
  const move = useCallback((position: Point, save = false) => {
    const area = limits.current;
    if (!area) return;
    const next = { x: clamp(position.x, area.left, area.right), y: clamp(position.y, area.top, area.bottom) };
    current.current = next; setPoint(next);
    if (save) persist(next, area);
  }, [persist]);
  const reset = useCallback(() => {
    const area = limits.current;
    if (area) move({ x: area.left, y: area.bottom }, true);
  }, [move]);

  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.append(probe);
    const measure = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width || window.innerWidth;
      const height = viewport?.height || window.innerHeight;
      const offsetX = viewport?.offsetLeft || 0;
      const offsetY = viewport?.offsetTop || 0;
      const computed = getComputedStyle(probe);
      const inset = (value: string) => Math.max(12, parseFloat(value) || 0);
      const size = button.current?.offsetWidth || 64;
      const area: Bounds = { width, height, size, left: offsetX + inset(computed.paddingLeft), top: offsetY + inset(computed.paddingTop), right: offsetX + width - size - inset(computed.paddingRight), bottom: offsetY + height - size - inset(computed.paddingBottom) };
      let ratio = { x: 0, y: 1 };
      if (limits.current && current.current) {
        ratio = { x: (current.current.x - limits.current.left) / Math.max(1, limits.current.right - limits.current.left), y: (current.current.y - limits.current.top) / Math.max(1, limits.current.bottom - limits.current.top) };
      } else try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Point | null;
        if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) ratio = { x: clamp(saved.x, 0, 1), y: clamp(saved.y, 0, 1) };
      } catch { /* Ignore damaged or unavailable storage. */ }
      limits.current = area; setBounds(area);
      move({ x: area.left + ratio.x * Math.max(0, area.right - area.left), y: area.top + ratio.y * Math.max(0, area.bottom - area.top) });
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => { window.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("scroll", measure); if (hold.current) clearTimeout(hold.current); probe.remove(); };
  }, [move]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || !current.current) return;
    suppressClick.current = false;
    drag.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, start: current.current, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    hold.current = setTimeout(() => { if (drag.current) { drag.current.active = true; suppressClick.current = true; setDragging(true); } }, 360);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) return;
    const dx = event.clientX - state.startX; const dy = event.clientY - state.startY;
    if (!state.active) {
      if (Math.hypot(dx, dy) > 9) { if (hold.current) clearTimeout(hold.current); suppressClick.current = true; }
      return;
    }
    event.preventDefault();
    move({ x: state.start.x + dx, y: state.start.y + dy });
  };
  const finish = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    if (!drag.current || drag.current.pointer !== event.pointerId) return;
    if (hold.current) clearTimeout(hold.current);
    if (cancelled) move(drag.current.start);
    else if (drag.current.active && current.current && limits.current) persist(current.current, limits.current);
    drag.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Home") { event.preventDefault(); reset(); return; }
    const delta = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[event.key];
    if (delta && current.current) { event.preventDefault(); move({ x: current.current.x + delta[0], y: current.current.y + delta[1] }, true); }
  };
  const consumeDragClick = (event: MouseEvent<HTMLButtonElement>) => {
    const suppress = suppressClick.current && event.detail !== 0;
    suppressClick.current = false;
    return suppress;
  };
  const wrapperStyle: CSSProperties | undefined = point ? { left: point.x, top: point.y, right: "auto", bottom: "auto" } : undefined;
  const panelWidth = bounds ? Math.max(1, Math.min(390, bounds.right + bounds.size - bounds.left)) : 390;
  const panelHeight = bounds ? Math.max(1, Math.min(650, bounds.bottom + bounds.size - bounds.top)) : 500;
  const panelStyle: CSSProperties | undefined = point && bounds ? { position: "fixed", left: clamp(point.x, bounds.left, bounds.right + bounds.size - panelWidth), top: clamp(point.y - panelHeight - 12, bounds.top, bounds.bottom + bounds.size - panelHeight), bottom: "auto", width: panelWidth, height: panelHeight, maxHeight: "calc(100dvh - 24px)" } : undefined;
  return { button, dragging, wrapperStyle, panelStyle, reset, consumeDragClick, onPointerDown, onPointerMove, onPointerUp: (event: PointerEvent<HTMLButtonElement>) => finish(event), onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => finish(event, true), onKeyDown };
}
