import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPublicSettings } from "@/lib/platform-settings";
import { EMAIL_TEMPLATE_FILES, configuredEmailOrigin, renderSecurityEmail, securityEmailVariables, type SecurityEmailContent } from "@/lib/email-branding";

const sourceCache = new Map<string, string>();

export async function prepareSecurityEmail(content: SecurityEmailContent) {
  const file = EMAIL_TEMPLATE_FILES[content.kind];
  if (!file) throw new Error("Unknown security email template");
  let source = sourceCache.get(file);
  if (!source) { source = await readFile(join(process.cwd(), "emails", "resend", file), "utf8"); sourceCache.set(file, source); }
  // Cache template layout only, never account codes or social settings snapshots.
  const settings = await getPublicSettings();
  const origin = configuredEmailOrigin(process.env);
  const variables = securityEmailVariables(content, settings, origin, { allowLocalHttp: process.env.NODE_ENV === "development" });
  // Imported templates use the requested public domain; runtime supports another verified origin too.
  const html = renderSecurityEmail(source.replaceAll("https://marasalelm.com", origin), variables);
  return { html, variables, allowHostedTemplate: origin.startsWith("https:") };
}
