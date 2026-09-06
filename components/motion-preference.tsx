"use client";
import { useEffect, useSyncExternalStore } from "react";
import { PauseCircle, PlayCircle } from "lucide-react";
const KEY = "meras-motion";
let memory: boolean | null = null;
function snapshot() { if (typeof window === "undefined") return false; if (memory !== null) return memory; try { return localStorage.getItem(KEY) === "off"; } catch { return false; } }
function subscribe(listener: () => void) { const sync = (event: StorageEvent) => { if (event.key === KEY) { memory = null; listener(); } }; window.addEventListener("storage", sync); window.addEventListener("meras:motion-preference", listener); return () => { window.removeEventListener("storage", sync); window.removeEventListener("meras:motion-preference", listener); }; }
export function MotionPreference() {
  const paused = useSyncExternalStore(subscribe, snapshot, () => false);
  useEffect(() => { document.documentElement.dataset.motion = paused ? "off" : "on"; window.dispatchEvent(new Event("meras:motion-preference")); }, [paused]);
  const toggle = () => { memory = !paused; try { localStorage.setItem(KEY, memory ? "off" : "on"); } catch { /* Session preference still works. */ } document.documentElement.dataset.motion = memory ? "off" : "on"; window.dispatchEvent(new Event("meras:motion-preference")); };
  return <button type="button" className="motion-preference" onClick={toggle} aria-pressed={paused} title="تحترم المنصة إعداد تقليل الحركة في جهازك أيضًا">{paused ? <PlayCircle size={17} /> : <PauseCircle size={17} />}{paused ? "تشغيل الحركات" : "إيقاف الحركات"}</button>;
}
