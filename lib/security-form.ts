/** Shared UI validation; the server independently enforces the same password policy. */
export function normalizeVerificationCode(value: string) {
  return value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0)).replace(/[^0-9]/g, "").slice(0, 6);
}
export function passwordRequirements(value: string) {
  return { length: value.length >= 10 && value.length <= 128, number: /\d/.test(value), symbol: /[^\p{L}\p{N}\s]/u.test(value) };
}
export function acceptsNewPassword(value: string) { return Object.values(passwordRequirements(value)).every(Boolean); }
