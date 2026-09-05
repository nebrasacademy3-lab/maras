import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { AppButton, EmptyState, LoadingState, Screen } from "@/src/components/ui";

export default function OAuthCallback() {
  const [expired, setExpired] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setExpired(true), 20_000); return () => clearTimeout(timer); }, []);
  // Expo's system-browser session exchanges the code with its in-memory PKCE verifier.
  // A cold/deep-linked callback cannot log anyone in or consume the URL as a bearer token.
  return <Screen>{expired ? <EmptyState title="أعد محاولة تسجيل الدخول" text="انتهت جلسة تسجيل الدخول أو أُغلق التطبيق أثناءها. ابدأ من جديد بأمان." action={<AppButton title="تسجيل الدخول" onPress={() => router.replace("/(auth)/login")} />} /> : <LoadingState label="نؤكد تسجيل دخولك بأمان..." />}</Screen>;
}
