import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useRef } from "react";
import { LaunchScreen } from "@/src/components/LaunchScreen";
import { FIRST_RUN_ONBOARDING_KEY, usePlatformControls } from "@/src/components/PlatformControls";
import { ErrorState, Screen } from "@/src/components/ui";
import { reconcileOnboardingCompletion } from "@/src/lib/onboardingSync";
import { useAuth } from "@/src/providers/AuthProvider";

export default function Index() {
  const { user, loading, offline, token, authError, refresh } = useAuth();
  const controls = usePlatformControls();
  const routed = useRef(false);
  const onboardingEnabled = !controls.ready || controls.enabled("onboarding");
  useEffect(() => {
    if (loading || controls.loading || routed.current || (offline && token && !user)) return;
    let active = true;
    void (async () => {
      const startedAt = Date.now();
      if (user) void reconcileOnboardingCompletion(user);
      let onboardingSeen = false;
      try { onboardingSeen = Boolean(await SecureStore.getItemAsync(FIRST_RUN_ONBOARDING_KEY)); } catch { /* Continue with a safe first-run experience. */ }
      const remaining = Math.max(0, 850 - (Date.now() - startedAt));
      if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));
      if (!active) return;
      routed.current = true;
      if (onboardingEnabled && !onboardingSeen) { router.replace({ pathname: "/onboarding", params: { entry: "first-run" } }); return; }
      router.replace(user ? (user.profileCompleted ? "/(tabs)" : "/complete-profile") : "/(auth)/welcome");
    })();
    return () => { active = false; };
  }, [controls.loading, loading, offline, onboardingEnabled, token, user]);
  if (!loading && offline && token && !user) return <Screen footer={false}><ErrorState title="تعذر استعادة جلستك" text={authError || "تعذر التحقق من الحساب المحفوظ. تحقق من الشبكة ثم حاول مجددًا."} onRetry={() => void refresh()} /></Screen>;
  return <LaunchScreen />;
}
