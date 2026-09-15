import { asciiSlug } from "@/lib/catalog-templates";

/** Public content identifiers only; existing database primary keys are never renamed. */
export function automaticIdentifier(title: string, prefix: string, maxLength = 80, nonce = crypto.randomUUID()) {
  const safePrefix = asciiSlug(prefix).slice(0, 15);
  const suffix = nonce.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 20);
  if (suffix.length < 12 || maxLength < 40 || maxLength > 120) throw new Error("Invalid identifier seed");
  const stem = `${safePrefix}-${asciiSlug(title)}`.slice(0, maxLength - suffix.length - 1).replace(/-+$/g, "");
  return `${stem}-${suffix}`;
}
