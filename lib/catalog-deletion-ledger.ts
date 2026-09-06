/** A pure predicate shared by all static/seed merge paths. */
export type CatalogDeletion = { entityType: string; entityId: string };
export function catalogDeletionSet(rows: CatalogDeletion[]) {
  return new Set(rows.map(row => `${row.entityType}:${row.entityId}`));
}
export function courseWasDeleted(deleted: ReadonlySet<string>, course: { slug: string; institutionSlug: string; specialtySlug?: string }) {
  return deleted.has(`course:${course.slug}`) || deleted.has(`institution:${course.institutionSlug}`) || Boolean(course.specialtySlug && deleted.has(`specialty:${course.specialtySlug}`));
}
