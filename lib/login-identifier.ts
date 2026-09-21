/** Preserve explicit international codes while accepting existing Saudi local logins. */
export function loginPhoneCandidate(value: string) {
 const raw=value.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0));
 if(!/^[+\d\s().-]+$/.test(raw))return value;
 const normalized=raw.replace(/[\s().-]/g,"");
 if(/^\+[1-9]\d{7,14}$/.test(normalized))return normalized;
 if(/^00[1-9]\d{7,14}$/.test(normalized))return '+'+normalized.slice(2);
 if(/^9665\d{8}$/.test(normalized))return '+'+normalized;
 if(/^05\d{8}$/.test(normalized))return '+966'+normalized.slice(1);
 if(/^5\d{8}$/.test(normalized))return '+966'+normalized;
 return value;
}
