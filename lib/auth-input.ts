/** Keep OTP input compatible with Arabic keyboards, paste and OS autofill. */
export function normalizeVerificationCode(value: string) {
  return value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/[^0-9]/g, "").slice(0, 6);
}

export function passwordRequirements(password: string) {
  return [
    { label: "10 أحرف على الأقل", met: password.length >= 10 && password.length <= 128 },
    { label: "رقم واحد على الأقل", met: /\d/.test(password) },
    { label: "رمز خاص مثل @ أو #", met: /[^\p{L}\p{N}\s]/u.test(password) },
  ];
}
