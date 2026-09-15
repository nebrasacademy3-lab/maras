import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { platformSettings } from "@/db/schema";
import { DEFAULT_INFORMATION, validateInformation } from "@/lib/information-contract";
export const INFORMATION_KEY = "public_information_v1";
export const getInformationContent = cache(async () => {
  if (!process.env.DATABASE_URL) return { content: DEFAULT_INFORMATION, version: null };
  try { const [row] = await getDb().select({ value: platformSettings.value, updatedAt: platformSettings.updatedAt }).from(platformSettings).where(eq(platformSettings.key, INFORMATION_KEY)).limit(1); if (row) return { content: validateInformation(JSON.parse(row.value)), version: row.updatedAt }; }
  catch { console.error("[public-information] could not read editorial override; using safe defaults"); }
  return { content: DEFAULT_INFORMATION, version: null };
});
