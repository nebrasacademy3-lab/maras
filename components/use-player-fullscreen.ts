"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { capturePlayerScroll, currentFullscreenElement, enterViewportFullscreen, exitPlayerFullscreen, requestPlayerFullscreen, watchPlayerViewport } from "@/lib/player-fullscreen";

export function usePlayerFullscreen(shellRef: RefObject<HTMLDivElement | null>) {
  const [mode, setMode] = useState<"inline" | "native" | "viewport">("inline");
  const [rotated, setRotated] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(mode);
  const request = useRef(0);
  const pending = useRef(false);
  const requestedOpen = useRef(false);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const releaseViewport = useRef<(() => void) | null>(null);
  const restoreScroll = useRef<(() => void) | null>(null);
  const changeMode = useCallback((next: typeof mode) => { active.current = next; setMode(next); if (next === "inline") setRotated(false); }, []);
  const cancelWatchdog = useCallback(() => { if (watchdog.current) clearTimeout(watchdog.current); watchdog.current = null; }, []);

  const close = useCallback(async () => {
    requestedOpen.current = false; request.current += 1; pending.current = false; cancelWatchdog();
    const element = shellRef.current;
    if (element && currentFullscreenElement(document) === element) {
      try { await exitPlayerFullscreen(document); } catch { if (mounted.current) setMessage("استخدم زر الرجوع أو Esc للخروج من ملء الشاشة."); return; }
    }
    if (mounted.current) changeMode("inline");
  }, [cancelWatchdog, changeMode, shellRef]);

  const toggle = useCallback(async () => {
    if (active.current !== "inline" || pending.current) { await close(); return; }
    const element = shellRef.current;
    if (!element) return;
    setMessage("");
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : element;
    restoreScroll.current = capturePlayerScroll(element);
    const attempt = ++request.current;
    requestedOpen.current = true;
    pending.current = true;
    const fallback = () => {
      if (mounted.current && request.current === attempt && currentFullscreenElement(document) !== element) { pending.current = false; changeMode("viewport"); }
    };
    // Some embedded engines expose an API but never settle its Promise/event.
    watchdog.current = setTimeout(fallback, 1500);
    try {
      const operation = requestPlayerFullscreen(element);
      if (operation) await operation;
      if (!mounted.current || attempt !== request.current) {
        if ((!mounted.current || !requestedOpen.current) && currentFullscreenElement(document) === element) void exitPlayerFullscreen(document).catch(() => undefined);
        return;
      }
      cancelWatchdog(); pending.current = false;
      if (currentFullscreenElement(document) === element) changeMode("native");
      else fallback();
    } catch { cancelWatchdog(); fallback(); }
  }, [cancelWatchdog, changeMode, close, shellRef]);

  useEffect(() => {
    mounted.current = true;
    const element = shellRef.current;
    const changed = () => {
      if (currentFullscreenElement(document) === element) {
        if (!requestedOpen.current) { void exitPlayerFullscreen(document).catch(() => undefined); return; }
        cancelWatchdog(); pending.current = false; changeMode("native");
      } else if (active.current === "native") {
        requestedOpen.current = false; request.current += 1; pending.current = false; cancelWatchdog(); changeMode("inline");
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && pending.current) { event.preventDefault(); void close(); return; }
      if (active.current === "inline") return;
      if (event.key === "Escape") { event.preventDefault(); void close(); return; }
      if (event.key !== "Tab" || !element) return;
      const focusable = Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')).filter(item => item.getClientRects().length > 0);
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    const pageHidden = () => {
      // pagehide can freeze React before effects commit (back-forward cache).
      if (active.current === "viewport") { releaseViewport.current?.(); releaseViewport.current = null; void close(); }
    };
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("webkitfullscreenchange", changed);
    document.addEventListener("keydown", key, true);
    window.addEventListener("pagehide", pageHidden);
    return () => {
      mounted.current = false; requestedOpen.current = false; request.current += 1; cancelWatchdog(); pending.current = false;
      document.removeEventListener("fullscreenchange", changed); document.removeEventListener("webkitfullscreenchange", changed);
      document.removeEventListener("keydown", key, true); window.removeEventListener("pagehide", pageHidden);
      if (element && currentFullscreenElement(document) === element) void exitPlayerFullscreen(document).catch(() => undefined);
    };
  }, [cancelWatchdog, changeMode, close, shellRef]);

  useLayoutEffect(() => {
    const element = shellRef.current;
    if (!element || mode === "inline") return;
    const release = mode === "viewport" ? enterViewportFullscreen(element) : watchPlayerViewport(element, true);
    releaseViewport.current = release;
    element.focus({ preventScroll: true });
    return () => {
      release(); if (releaseViewport.current === release) releaseViewport.current = null;
      const target = restoreFocus.current; if (target?.isConnected) target.focus({ preventScroll: true });
      if (active.current === "inline") {
        const restore = restoreScroll.current;
        restore?.();
        // WebKit completes native-fullscreen layout restoration on the next frame.
        requestAnimationFrame(() => { if (mounted.current && active.current === "inline") restore?.(); });
      }
    };
  }, [mode, shellRef]);

  return { fullscreen: mode !== "inline", fallbackFullscreen: mode === "viewport", nativeFullscreen: mode === "native", rotated, toggleRotation: () => setRotated(value => !value), toggle, close, message };
}
