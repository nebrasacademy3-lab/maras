import React from "react";
import { AppHeader } from "@/src/components/AppHeader";
import { ErrorState, LoadingState, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/providers/AuthProvider";

type Options = {
  title: string;
  loadingLabel: string;
  back?: boolean;
  scroll?: boolean;
  footer?: boolean;
};

/** Keeps protected screens out of guest mode until session restoration settles. */
export function useAuthRestoreState({ title, loadingLabel, back = false, scroll, footer }: Options) {
  const auth = useAuth();
  const pendingOfflineSession = !auth.user && auth.offline && Boolean(auth.token);
  const authReady = !auth.loading && !pendingOfflineSession;
  const restoration = auth.loading
    ? <Screen scroll={scroll} footer={footer}><LoadingState label={loadingLabel} /></Screen>
    : pendingOfflineSession
      ? <Screen scroll={scroll} footer={footer}><AppHeader title={title} back={back} /><ErrorState title="تعذر استعادة الجلسة" text={auth.authError || "تحقق من اتصالك ثم أعد المحاولة."} onRetry={() => void auth.refresh()} /></Screen>
      : null;

  return { ...auth, authReady, restoration };
}
