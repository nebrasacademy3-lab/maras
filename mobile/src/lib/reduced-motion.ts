import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

// One native subscription for the whole app, not one per animated card.
// Default to visible, reduced motion until the device preference is known.
let reduced = true;
let generation = 0;
let subscription: ReturnType<typeof AccessibilityInfo.addEventListener> | null = null;
const listeners = new Set<() => void>();
function update(value: boolean) { if (reduced === value) return; reduced = value; for (const listener of listeners) listener(); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!subscription) {
    const request = ++generation;
    subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", update);
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (request === generation) update(value); }).catch(() => { if (request === generation) update(true); });
  }
  return () => { listeners.delete(listener); if (!listeners.size) { generation++; subscription?.remove(); subscription = null; } };
}
export function useDeviceReducedMotion() { return useSyncExternalStore(subscribe, () => reduced, () => true); }
