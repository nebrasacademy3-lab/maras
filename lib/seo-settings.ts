import "server-only";
import type { Metadata } from "next";
import { cache } from "react";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { platformSettings } from "@/db/schema";
import { publicPageMetadata } from "@/lib/seo";
import { staticSeoPage, validateSeoOverride, type SeoOverride } from "@/lib/seo-pages";

export function seoOverrideKey(path: string) { return `seo.page.${createHash("sha256").update(path).digest("hex")}`; }
export function parseSeoOverride(value: string | undefined): SeoOverride | null {
  if (!value) return null;
  try { return validateSeoOverride(JSON.parse(value)); } catch { return null; }
}
export const getSeoOverride = cache(async (path: string) => {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [row] = await getDb().select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, seoOverrideKey(path))).limit(1);
    return parseSeoOverride(row?.value);
  } catch {
    // An optional editorial setting must not take a public page offline.
    console.error("[seo] Could not read page metadata override");
    return null;
  }
});
export async function resolvedPublicPageMetadata(path: string, title: string, description: string, options: { noindex?: boolean; image?: string } = {}): Promise<Metadata> {
  const override = await getSeoOverride(path);
  return publicPageMetadata(path, override?.title || title, override?.description || description, options);
}
export async function staticPublicPageMetadata(path: string): Promise<Metadata> {
  const page = staticSeoPage(path);
  return resolvedPublicPageMetadata(path, page.title, page.description);
}
