export type CatalogFilterScope = "personal" | "university" | "specialty" | "all";
export type CatalogFilterUser = { id: number; universitySlug: string | null; specialty: string | null } | null;
export type CatalogFilterState = {
  identity: string;
  profileSignature: string;
  customized: boolean;
  scope: CatalogFilterScope;
  university: string;
  specialty: string;
};

export function catalogFilterContext(
  loading: boolean,
  user: CatalogFilterUser,
  allUniversities: string,
  allSpecialties: string,
): CatalogFilterState {
  const identity = loading ? "restoring" : user ? `user:${user.id}` : "guest";
  const profileSignature = user ? `${user.universitySlug || ""}\u0000${user.specialty || ""}` : "guest";
  return {
    identity,
    profileSignature,
    customized: false,
    scope: user ? "personal" : "all",
    university: user?.universitySlug || allUniversities,
    specialty: user?.specialty || allSpecialties,
  };
}

/** Resets another identity, and refreshes untouched defaults for the same identity. */
export function resolveCatalogFilterState(stored: CatalogFilterState, context: CatalogFilterState): CatalogFilterState {
  if (stored.identity !== context.identity) return context;
  if (!stored.customized && stored.profileSignature !== context.profileSignature) return context;
  return stored;
}

export function customizeCatalogFilters(current: CatalogFilterState, patch: Partial<Pick<CatalogFilterState, "scope" | "university" | "specialty">>): CatalogFilterState {
  return { ...current, ...patch, customized: true };
}
