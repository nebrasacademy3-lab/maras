import { router } from "expo-router";
import React, { useEffect } from "react";
import { BrandMark } from "@/src/components/Brand";
import { LoadingState, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/providers/AuthProvider";

export default function Index() {
  const { user, loading } = useAuth();
  useEffect(() => { if (!loading) router.replace(user ? (user.profileCompleted ? (user.onboardingCompleted ? "/(tabs)" : "/onboarding") : "/complete-profile") : "/(auth)/welcome"); }, [loading, user]);
  return <Screen scroll={false} showFooter={false} style={{ alignItems: "center", justifyContent: "center" }}><BrandMark size={112} whiteTile /><LoadingState label="نجهّز تجربتك التعليمية..." /></Screen>;
}

