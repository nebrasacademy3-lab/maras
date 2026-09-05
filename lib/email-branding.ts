import { normalizedSocialLinks, type SocialSettingsInput } from "@/lib/social-links";

export type SecurityEmailContent = { kind: "verify-email" | "change-password"; code: string } | { kind: "reset-password"; resetUrl: string };
export const EMAIL_TEMPLATE_FILES = { "verify-email": "01-verify-email.html", "change-password": "02-change-password.html", "reset-password": "03-reset-password.html" } as const;
export const EMAIL_TEMPLATE_ENV = { "verify-email": "RESEND_TEMPLATE_VERIFY_EMAIL", "change-password": "RESEND_TEMPLATE_CHANGE_PASSWORD", "reset-password": "RESEND_TEMPLATE_RESET_PASSWORD" } as const;

export type EmailOriginOptions = { allowLocalHttp?: boolean };
const DEFAULT_EMAIL_ORIGIN = "https://marasalelm.com";

export function emailSiteOrigin(configured?: string, options: EmailOriginOptions = {}) {
  if (!configured) return DEFAULT_EMAIL_ORIGIN;
  const url = new URL(configured);
  const localDevelopment = options.allowLocalHttp === true && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localDevelopment) || url.username || url.password) throw new Error("Invalid public email origin");
  return url.origin;
}

/** Never derive security-email destinations from an incoming Host header. */
export function configuredEmailOrigin(environment: { APP_URL?: string; NEXT_PUBLIC_SITE_URL?: string; NODE_ENV?: string }) {
  return emailSiteOrigin(environment.APP_URL?.trim() || environment.NEXT_PUBLIC_SITE_URL?.trim(), { allowLocalHttp: environment.NODE_ENV === "development" });
}

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

/** Only trusted template HTML is raw. Account URLs are normalized and escaped. */
export function securityEmailVariables(content: SecurityEmailContent, settings: SocialSettingsInput, origin: string, options: EmailOriginOptions = {}) {
  const site = emailSiteOrigin(origin, options);
  // Email clients cannot retrieve localhost images. Local action links are only
  // for the developer; logos and channel icons remain on the public HTTPS site.
  const assetSite = site.startsWith("http:") ? DEFAULT_EMAIL_ORIGIN : site;
  const links = normalizedSocialLinks(settings);
  const variables: Record<string, string> = { LOGO_URL: assetSite + "/brand/logo-light-hq.png", SOCIAL_HEADING: links.length ? "تابع مراس العلم على قنواتها الرسمية" : "" };
  for (let index = 0; index < 10; index++) {
    const link = links[index];
    variables[`SOCIAL_${index + 1}`] = link ? `<a href="${escapeEmailHtml(link.url)}" title="${escapeEmailHtml(link.labelAr)}" style="display:inline-block;margin:4px;padding:4px;border:1px solid #e3e8f3;border-radius:12px;background:#fff;text-decoration:none"><img src="${assetSite}/email-assets/${link.id}.png" alt="${escapeEmailHtml(link.labelAr)}" width="36" height="36" style="display:block;border:0;color:#1258e8;font:11px Tahoma,Arial,sans-serif"></a>` : "";
  }
  if (content.kind === "reset-password") {
    const reset = new URL(content.resetUrl);
    if (reset.origin !== site || reset.pathname !== "/reset-password" || reset.username || reset.password || reset.hash || [...reset.searchParams.keys()].some(key => key !== "token") || reset.searchParams.getAll("token").length !== 1 || !/^[A-Za-z0-9_-]{32,256}$/.test(reset.searchParams.get("token") || "")) throw new Error("Invalid password reset link");
    variables.RESET_URL = escapeEmailHtml(reset.href);
  } else {
    if (!/^[0-9]{6}$/.test(content.code)) throw new Error("Invalid verification code");
    variables.CODE = content.code;
  }
  return variables;
}

export function renderSecurityEmail(source: string, variables: Record<string, string>) {
  return source.replace(/\{\{\{([A-Z][A-Z0-9_]*)\}\}\}/g, (_match, key: string) => {
    if (!Object.hasOwn(variables, key)) throw new Error("Missing email template variable");
    return variables[key];
  });
}

export function canUseHostedEmailTemplate(variables: Record<string, string>) {
  return Object.keys(variables).length <= 50 && Object.values(variables).every(value => value.length <= 2_000);
}
