import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { LoadingState, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/providers/AuthProvider";

// Referral share links (https://<host>/r/CODE) open here through universal/app links.
export default function ReferralLinkScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const { user, loading } = useAuth();
  const code = String(Array.isArray(params.code) ? params.code[0] : params.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
  if (loading) return <Screen><LoadingState /></Screen>;
  if (user) return <Redirect href="/referrals" />;
  return <Redirect href={code ? { pathname: "/(auth)/register", params: { ref: code } } : "/(auth)/register"} />;
}
