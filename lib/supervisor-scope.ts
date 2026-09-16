import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { supervisorAssignments } from "@/db/schema";

export type SupervisorScope = {
  id: number;
  supervisorId: number;
  institutionSlug: string | null;
  specialty: string | null;
  active: boolean;
};

export type ScopedCourse = {
  universitySlug?: string | null;
  specialty?: string | null;
  specialtySlug?: string | null;
};

export type ScopedStudent = {
  universitySlug?: string | null;
  specialty?: string | null;
  specialtySlug?: string | null;
};

export async function getSupervisorScopes(supervisorId: number): Promise<SupervisorScope[]> {
  const rows = await getDb().select().from(supervisorAssignments).where(and(eq(supervisorAssignments.supervisorId, supervisorId), eq(supervisorAssignments.active, true)));
  return rows;
}

/** A configured assignment is an allow-list. Null fields are explicit wildcards for future admin-only scopes. */
export function supervisorScopeAllows(scope: Pick<SupervisorScope, "institutionSlug" | "specialty">, subject: ScopedCourse | ScopedStudent) {
  const institutionMatches = !scope.institutionSlug || scope.institutionSlug === (subject.universitySlug || "");
  const specialtyValue = subject.specialty || subject.specialtySlug || "";
  const specialtyMatches = !scope.specialty || scope.specialty === specialtyValue || scope.specialty === (subject.specialtySlug || "");
  return institutionMatches && specialtyMatches;
}

export function supervisorScopesAllow(scopes: readonly Pick<SupervisorScope, "institutionSlug" | "specialty">[], subject: ScopedCourse | ScopedStudent) {
  return scopes.length > 0 && scopes.some((scope) => supervisorScopeAllows(scope, subject));
}
