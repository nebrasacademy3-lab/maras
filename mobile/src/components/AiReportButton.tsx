import React, { useRef, useState } from "react";
import { AppButton } from "@/src/components/ui";
import { api, ApiError, jsonBody, getApiSessionRevision } from "@/src/lib/api";
import { nativeToast, promptNative } from "@/src/lib/interaction-events";
import { useLanguage } from "@/src/providers/LanguageProvider";

/** Reporting stays inside the app and sends only the selected excerpt/reference after confirmation. */
export function AiReportButton({ source, reference, content = "" }: {
  source: "assistant" | "message" | "artifact" | "quiz"; reference: string; content?: string;
}) {
  const { isRTL } = useLanguage();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function report() {
    if (pending.current) return;
    pending.current = true;
    const identity = getApiSessionRevision();
    try {
      const reason = await promptNative(isRTL ? "الإبلاغ عن محتوى" : "Report content", isRTL ? "اكتب سبب البلاغ (5–500 حرف). سنرسل المرجع ومقتطفًا من هذه الإجابة إلى فريق مراجعة مراس فقط؛ لن تُرسل ملفاتك أو بقية محادثتك. يمكنك الإلغاء." : "Describe the issue (5–500 characters). Only this reference and an excerpt are sent to the Meras review team, not your files or other messages. You can cancel.");
      if (reason === null) return;
      if (reason.trim().length < 5 || reason.length > 500) { nativeToast(isRTL ? "اكتب سببًا بين 5 و500 حرف" : "Enter 5–500 characters", "error"); return; }
      if (getApiSessionRevision() !== identity) return;
      setBusy(true);
      await api("/api/content-reports", { method: "POST", body: jsonBody({ source, reference, reason: reason.trim(), excerpt: content.slice(0, 2000) }) });
      if (getApiSessionRevision() === identity) nativeToast(isRTL ? "حُفظ بلاغك في قائمة مراجعة الدعم" : "Your report was saved for review", "success");
    } catch (error) { if (getApiSessionRevision() === identity) nativeToast(error instanceof ApiError ? error.message : isRTL ? "تعذر إرسال البلاغ" : "Could not send the report", "error"); }
    finally { pending.current = false; setBusy(false); }
  }
  return <AppButton title={isRTL ? "الإبلاغ عن المحتوى" : "Report content"} icon="flag-outline" variant="ghost" full={false} loading={busy} onPress={() => void report()} />;
}
