import { and, asc, eq } from "drizzle-orm";
import { unstable_noStore as noStore } from "next/cache";
import { getDb } from "@/db";
import { platformPartners } from "@/db/schema";

export type PublicPartner = {
  id: number;
  name: string;
  kind: "partner" | "accreditation" | "payment";
  description: string;
  logo: string;
  destinationUrl: string | null;
  credentialNumber: string | null;
  verificationUrl: string | null;
  sortOrder: number;
};

function publicLogo(row: typeof platformPartners.$inferSelect) {
  return row.logoObjectKey
    ? `/api/public/partners/${row.id}/logo`
    : isHttps(row.logoUrl) ? row.logoUrl! : "";
}

function isHttps(value: string | null) {
  if (!value) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export async function getPublicPartners(): Promise<PublicPartner[]> {
  noStore();
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await getDb().select().from(platformPartners).where(and(eq(platformPartners.status, "published"), eq(platformPartners.rightsConfirmed, true))).orderBy(asc(platformPartners.sortOrder), asc(platformPartners.id));
    return rows.flatMap((row) => {
      const logo = publicLogo(row);
      if (!logo) return [];
      const kind: PublicPartner["kind"] = row.kind === "accreditation" || row.kind === "payment" ? row.kind : "partner";
      if (kind === "accreditation" && (!row.credentialNumber?.trim() || !row.rightsReference?.trim() || !isHttps(row.verificationUrl))) return [];
      return [{
        id: row.id, name: row.name, kind, description: row.description, logo,
        destinationUrl: isHttps(row.destinationUrl) ? row.destinationUrl : null,
        credentialNumber: row.credentialNumber?.trim() || null,
        verificationUrl: isHttps(row.verificationUrl) ? row.verificationUrl : null,
        sortOrder: row.sortOrder,
      }];
    });
  } catch {
    return [];
  }
}
