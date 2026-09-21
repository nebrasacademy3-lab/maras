export const INSTRUCTOR_QUALIFICATIONS = ["student", "diploma", "bachelor", "master", "doctorate", "professional", "other"] as const;
export const INSTRUCTOR_DOCUMENT_KINDS = ["identity_front", "identity_back", "passport", "selfie", "cv", "certificate"] as const;
export const INSTRUCTOR_EDITABLE_STATUSES = ["draft", "changes_requested"] as const;
export type InstructorApplicationStatus = "draft" | "submitted" | "changes_requested" | "approved" | "rejected" | "suspended";
export type InstructorCompensation = "hourly" | "course";
export type SignaturePoint = { x: number; y: number };

/** Only bounded numeric strokes are accepted; no user SVG/HTML is stored/rendered. */
export function validateInstructorSignature(value: unknown): value is SignaturePoint[][] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) return false;
  let count = 0; let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const stroke of value) {
    if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length > 1500) return false;
    for (const point of stroke) {
      if (!point || typeof point !== "object" || typeof point.x !== "number" || typeof point.y !== "number" || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return false;
      count++; if (count > 5000) return false;
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    }
  }
  return count >= 12 && maxX - minX >= 0.08 && maxY - minY >= 0.02;
}

export function isInstructorApplicationEditable(status: string) { return status === "draft" || status === "changes_requested"; }
export function isInstructorAssignmentEditable(status: string) { return status === "assigned" || status === "in_progress" || status === "changes_requested"; }
export function validInstructorPhone(value: unknown): value is string { return typeof value === "string" && /^\+[1-9]\d{7,14}$/.test(value); }
export function validInstructorRate(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 100_000_000; }

/** ISO 13616 modulo-97, checked without unsafe large-number conversion. */
export function validInstructorIban(value: unknown) {
  if (typeof value !== "string") return false;
  const iban = value.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) || iban.startsWith("SA") && !/^SA\d{22}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const digits = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
