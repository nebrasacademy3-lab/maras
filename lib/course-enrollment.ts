/** Explicit enrollment control; auto preserves the pre-upgrade behavior. */
export const ENROLLMENT_MODES = ["auto", "open", "closed"] as const;
export type EnrollmentMode = typeof ENROLLMENT_MODES[number];
export function enrollmentMode(value: unknown): EnrollmentMode {
  return value === "open" || value === "closed" ? value : "auto";
}
export function enrollmentAvailable(mode: unknown, readyLessons: number, status = "published") {
  if (status !== "published" || mode === "closed") return false;
  return mode === "open" || readyLessons > 0;
}
