import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/src/providers/AuthProvider";
import { ThemeProvider } from "@/src/providers/ThemeProvider";
import { RealtimeSyncProvider } from "@/src/providers/RealtimeSyncProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnReconnect: true } } }));
  return <GestureHandlerRootView style={{ flex: 1 }}><QueryClientProvider client={queryClient}><ThemeProvider><AuthProvider><RealtimeSyncProvider>{children}</RealtimeSyncProvider></AuthProvider></ThemeProvider></QueryClientProvider></GestureHandlerRootView>;
}
