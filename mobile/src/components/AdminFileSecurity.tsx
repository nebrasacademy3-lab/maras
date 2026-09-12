import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, SectionTitle } from "@/src/components/ui";
import { api, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";

type Report = { scanner: { configured: boolean; provider: string; reachable: boolean | null }; scheduler: { enabled: boolean }; queues: { kind: string; counts: Record<string, number>; files: { id: number; originalName: string; scanStatus: string; attempts: number }[] }[] };
const labels: Record<string, string> = { request: "طلبات المواد", support: "الدعم", resource: "ملفات التعلم", ai: "أدوات مراس" };
export function AdminFileSecurity() {
  const { colors } = useTheme();
  const report = useQuery({ queryKey: ["admin-file-security"], queryFn: () => api<Report>("/api/admin/files/scan"), refetchInterval: 30_000 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function resume() {
    if (busy) return; setBusy(true); setMessage("");
    try {
      const result = await api<{ summary: { clean: number; pending: number; quarantined: number; failed: number } }>("/api/admin/files/scan", { method: "POST", timeoutMs: 120_000 });
      setMessage(`اجتازت: ${result.summary.clean} · معلقة: ${result.summary.pending} · محجورة: ${result.summary.quarantined} · تعذرت: ${result.summary.failed}. تستكمل الدفعات تلقائيًا.`);
      await report.refetch();
    } catch (error) { setMessage(error instanceof ApiError ? error.message : "تعذر استئناف الفحص."); }
    finally { setBusy(false); }
  }
  return <Card><SectionTitle title="أمان المرفقات" subtitle="تشخيص الخدمة وإعادة الفحص دون تجاوز الحماية" />
    {report.data ? <>
      <Text style={{ color: colors.text, textAlign: "right", lineHeight: 26 }}>المحرك: {report.data.scanner.provider === "clamd" ? "ClamAV" : report.data.scanner.provider === "remote" ? "HTTP" : "غير مهيأ"} · المعالجة التلقائية: {report.data.scheduler.enabled ? "مفعلة" : "معطلة"}</Text>
      {(!report.data.scanner.configured || report.data.scanner.reachable === false) && <Text style={{ color: colors.text, textAlign: "right", lineHeight: 26 }}>خدمة الفحص غير جاهزة. راجع إعداد المحرك وتعريفات الفيروسات في الاستضافة. ستبقى الملفات محمية حتى اجتياز الفحص.</Text>}
      {report.data.queues.map(queue => <View key={queue.kind} style={{ marginVertical: 10 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700" }}>{labels[queue.kind]}: {queue.counts.pending || 0} معلقة · {queue.counts.quarantined || 0} محجورة</Text>{queue.files.slice(0, 5).map(file => <Text key={file.id} style={{ color: colors.textSoft, textAlign: "right", marginTop: 6 }}>{file.originalName} — {file.scanStatus === "quarantined" ? "محجور" : "قيد الفحص"} · {file.attempts} محاولة</Text>)}</View>)}
    </> : <Text style={{ color: colors.text, textAlign: "right" }}>{report.error instanceof ApiError ? report.error.message : "جارٍ قراءة حالة الملفات…"}</Text>}
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: colors.text, textAlign: "right", lineHeight: 26, marginVertical: 12 }}>{message}</Text>}
    <AppButton title="استئناف فحص الملفات المعلقة" loading={busy} disabled={!report.data?.scanner.configured} icon="scan-outline" onPress={() => void resume()} />
    <AppButton title="تحديث الحالة" variant="soft" icon="refresh-outline" onPress={() => void report.refetch()} />
  </Card>;
}
