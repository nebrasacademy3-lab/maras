/** Build one request-scoped policy. The nonce is generated in Proxy, never from a client header. */
export function pageContentSecurityPolicy(nonce: string, options: { development: boolean; loopbackQa: boolean }) {
  if (!/^[A-Za-z0-9+/]{32,}={0,2}$/.test(nonce)) throw new Error("Invalid CSP nonce");
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    `connect-src 'self'${options.loopbackQa ? " http://127.0.0.1:3100" : ""} https://api.tap.company https://*.tap.company https://*.t3.storageapi.dev`,
    "frame-src 'self' https://*.tap.company",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}
