export type FloatingPoint = { x: number; y: number };
export type FloatingBounds = { minX: number; maxX: number; minY: number; maxY: number };
export const ASSISTANT_SIZE = 62;
export function floatingReleaseAction(held: boolean, moved: boolean) { return held ? "save" : moved ? "cancel" : "open"; }
export function floatingBounds(width: number, height: number, insets: { top: number; right: number; bottom: number; left: number }): FloatingBounds {
  const minX = Math.max(0, insets.left + 12);
  const minY = Math.max(0, insets.top + 12);
  return { minX, minY, maxX: Math.max(minX, width - insets.right - ASSISTANT_SIZE - 12), maxY: Math.max(minY, height - insets.bottom - ASSISTANT_SIZE - 12) };
}
export function clampFloatingPoint(point: FloatingPoint, bounds: FloatingBounds): FloatingPoint {
  return { x: Math.min(bounds.maxX, Math.max(bounds.minX, Number.isFinite(point.x) ? point.x : bounds.minX)), y: Math.min(bounds.maxY, Math.max(bounds.minY, Number.isFinite(point.y) ? point.y : bounds.maxY)) };
}
export function normalizedFloatingPoint(point: FloatingPoint, bounds: FloatingBounds): FloatingPoint {
  const safe = clampFloatingPoint(point, bounds);
  return { x: (safe.x - bounds.minX) / Math.max(1, bounds.maxX - bounds.minX), y: (safe.y - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY) };
}
export function resolveFloatingPoint(normalized: FloatingPoint | null, bounds: FloatingBounds, rtl: boolean): FloatingPoint {
  if (!normalized) return { x: rtl ? bounds.minX : bounds.maxX, y: Math.max(bounds.minY, bounds.maxY - 78) };
  return clampFloatingPoint({ x: bounds.minX + normalized.x * (bounds.maxX - bounds.minX), y: bounds.minY + normalized.y * (bounds.maxY - bounds.minY) }, bounds);
}
export function parseFloatingPoint(raw: string | null): FloatingPoint | null {
  try { const point = JSON.parse(raw || "null") as FloatingPoint | null; return point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 ? point : null; } catch { return null; }
}
