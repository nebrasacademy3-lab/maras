export const STAFF_UPDATE_CONFIRMATION = "تحديث حساب موظف";

export type StaffIdentityRecord = {
  id: number;
  email: string;
  phone: string | null;
  fullName: string;
  role: string;
  status: string;
  universitySlug: string | null;
  specialty: string | null;
};

export type StaffAccountSummary = StaffIdentityRecord;

export function staffAccountSummary(record: StaffIdentityRecord): StaffAccountSummary {
  return {
    id: record.id,
    email: record.email,
    phone: record.phone,
    fullName: record.fullName,
    role: record.role,
    status: record.status,
    universitySlug: record.universitySlug,
    specialty: record.specialty,
  };
}

export function hasConfirmedExistingStaffUpdate(payload: Record<string, unknown>) {
  return payload.allowExisting === true
    && typeof payload.confirmation === "string"
    && payload.confirmation.trim() === STAFF_UPDATE_CONFIRMATION;
}

export function resolveStaffIdentityMatches<T extends StaffIdentityRecord>(rows: T[], email: string, phone: string) {
  const canonicalEmail = email.toLowerCase();
  const emailAccount = rows.find((row) => row.email.toLowerCase() === canonicalEmail) ?? null;
  const phoneAccount = rows.find((row) => row.phone === phone) ?? null;
  const identitiesConflict = Boolean(emailAccount && phoneAccount && emailAccount.id !== phoneAccount.id);

  return {
    emailAccount,
    phoneAccount,
    existing: identitiesConflict ? null : emailAccount ?? phoneAccount,
    identitiesConflict,
  };
}
