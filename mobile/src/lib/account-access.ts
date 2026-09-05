import type { SessionUser } from "@/src/types";
import { safeInternalPath } from "@/src/lib/notification-routing";

export function accountRequirement(user: SessionUser | null) {
  if (!user) return "/(auth)/login";
  if (!user.emailVerified) return "/verify-email";
  if (!user.profileCompleted) return "/complete-profile";
  return null;
}

export function authDestination(user: SessionUser, next?: string, returnTo?: string | null) {
  const requirement = accountRequirement(user);
  const target = safeInternalPath(returnTo);
  const suffix = target ? `?return_to=${encodeURIComponent(target)}` : "";
  if (requirement) return `${requirement}${suffix}`;
  if (!user.onboardingCompleted || next === "/onboarding") return `/onboarding${suffix}`;
  if (target && !/^\/(?:\(auth\)|verify-email|complete-profile|oauth|onboarding)(?:\/|\?|$)/.test(target)) return target;
  return "/(tabs)";
}

export function hasCompleteAcademicProfile(user: SessionUser | null) {
  return Boolean(user?.profileCompleted && user.fullName.trim().length >= 5 && user.phone && user.universitySlug && user.specialty && user.academicLevel);
}

export function purchaseAccountRequirement(user: SessionUser | null) {
  const requirement = accountRequirement(user);
  if (requirement) return requirement;
  if (!hasCompleteAcademicProfile(user)) return "/complete-profile";
  return null;
}

export function normalizeEmailCode(value: string) {
  return value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776)).replace(/\D/g, "").slice(0, 6);
}
