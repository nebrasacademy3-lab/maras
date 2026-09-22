import { AppState, Platform } from "react-native";
import { retryQuery } from "@/src/lib/query-policy";
import React, { useEffect, useState } from "react";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/src/providers/AuthProvider";
import { ThemeProvider } from "@/src/providers/ThemeProvider";
import { RealtimeSyncProvider } from "@/src/providers/RealtimeSyncProvider";
import { LanguageProvider } from "@/src/providers/LanguageProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: retryQuery, refetchOnReconnect: true, refetchIntervalInBackground: false } } }));
  useEffect(() => {
    if (Platform.OS === "web") return;
    focusManager.setFocused(AppState.currentState === "active");
    const listener = AppState.addEventListener("change", state => focusManager.setFocused(state === "active"));
    return () => { listener.remove(); focusManager.setFocused(undefined); };
  }, []);
  return <GestureHandlerRootView style={{ flex: 1 }}><QueryClientProvider client={queryClient}><LanguageProvider><ThemeProvider><AuthProvider><RealtimeSyncProvider>{children}</RealtimeSyncProvider></AuthProvider></ThemeProvider></LanguageProvider></QueryClientProvider></GestureHandlerRootView>;
}
