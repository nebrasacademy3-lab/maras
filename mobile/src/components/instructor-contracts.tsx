import React, { useEffect, useRef, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppButton, Card, Field, LoadingState, SectionTitle } from "@/src/components/ui";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { SignaturePad, type SignatureStrokes } from "@/src/components/instructor-signature-pad";
import { api, getApiToken, jsonBody } from "@/src/lib/api";
import { downloadProtectedFile } from "@/src/lib/downloads";
import { useTheme } from "@/src/providers/ThemeProvider";

type Contract = { id: number; version: number; revision: number; title: string; status: "offered" | "signed" | "withdrawn" | "terminated"; termsAr: string; termsEn: string; compensationModel: "hourly" | "course"; rateHalalas: number; trialDays: number; trialTermsAr: string; trialTermsEn: string; contentHash: string; signedAt: string | null; signature: SignatureStrokes | null; organization: { legal_name?: string; commercial_registration_number?: string; vat_number?: string; legal_address?: string }; instructor: { fullName: string }; employment: { startDate: string; endDate: string; workLocation: string; weeklyHours: number; nationality: string; paymentTermsAr: string; paymentTermsEn: string; benefitsAr: string; benefitsEn: string } };
const statuses = { offered: "بانتظار قراءتك وتوقيعك", signed: "عقد موقّع", withdrawn: "عرض مسحوب", terminated: "عقد منتهي" };
export function InstructorContracts({ userId }: { userId: number }) {
  const { colors } = useTheme();
  const query = useQuery({ queryKey: ["instructor-contracts", userId], queryFn: ({ signal }) => api<{ contracts: Contract[] }>("/api/instructor/contracts", { signal }), retry: false, staleTime: 30_000 });
  if (query.isLoading) return <LoadingState label="جارٍ تحميل العقود…" />;
  if (query.isError) return <Card><Text style={{ color: colors.textSoft, textAlign: "right" }}>تعذر تحميل العقود الآن.</Text><AppButton title="تحديث العقود" variant="ghost" onPress={() => void query.refetch()} /></Card>;
  return <View style={{ gap: 16, marginBottom: 18 }}><SectionTitle title="عقود العمل" subtitle="نسختك المعروضة من الإدارة؛ راجعها كاملة قبل التوقيع" />{query.data?.contracts.length ? query.data.contracts.map(contract => <ContractCard key={contract.id + ":" + contract.revision} contract={contract} userId={userId} />) : <Card><Text style={{ color: colors.textSoft, lineHeight: 25, textAlign: "right" }}>سيظهر العقد هنا بعد مراجعة طلبك واعتماده وإرسال الإدارة عرضًا لك.</Text></Card>}<AppButton title="تحديث العقود" variant="ghost" onPress={() => void query.refetch()} /></View>;
}
function ContractCard({ contract, userId }: { contract: Contract; userId: number }) {
  const { colors } = useTheme(), client = useQueryClient();
  const [expanded, setExpanded] = useState(false), [signing, setSigning] = useState(false), [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState<SignatureStrokes>([]), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const mounted = useRef(true), pending = useRef(false), abort = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); }; }, []);
  const text = { color: colors.text, fontSize: 15, lineHeight: 27, textAlign: "right" as const };
  const en = { ...text, textAlign: "left" as const, writingDirection: "ltr" as const };
  const close = () => { if (pending.current) return; setSigning(false); setPassword(""); setSignature([]); };
  async function sign() {
    if (!accepted || pending.current || !password || signature.flat().length < 12) return;
    const token = getApiToken(); pending.current = true; setBusy(true); setMessage(""); abort.current = new AbortController();
    try {
      await api("/api/instructor/contracts/" + contract.id, { method: "POST", signal: abort.current.signal, body: jsonBody({ accepted: true, expectedRevision: contract.revision, contentHash: contract.contentHash, signature: signature.filter(stroke => stroke.length >= 2), password }) });
      if (!mounted.current || token !== getApiToken()) return;
      setPassword(""); setSignature([]); setSigning(false); setMessage("تم توثيق توقيعك. نسختك متاحة للتنزيل.");
      await client.invalidateQueries({ queryKey: ["instructor-contracts", userId] });
    } catch (error) { if (mounted.current && token === getApiToken()) setMessage(error instanceof Error ? error.message : "تعذر توقيع العقد. حدّث نسخته ثم أعد المحاولة."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); abort.current = null; }
  }
  async function download() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage("");
    try { await downloadProtectedFile({ path: "/api/instructor/contracts/" + contract.id + "/download", fileName: "meras-contract-" + contract.id + "-v" + contract.version + ".pdf", mimeType: "application/pdf", saveToFiles: true }); }
    catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "تعذر تحميل العقد."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return <Card style={{ gap: 12 }}><Text style={{ ...text, fontWeight: "800", fontSize: 21 }}>{contract.title}</Text><Text style={{ ...text, color: colors.primary }}>{statuses[contract.status]} · نسخة {contract.version}</Text><Text style={text}>{(contract.rateHalalas / 100).toLocaleString("ar-SA")} ر.س / {contract.compensationModel === "hourly" ? "ساعة" : "مادة"} · التجربة: {contract.trialDays} يومًا</Text>
    <AppButton title={expanded ? "طي تفاصيل العقد" : "قراءة العقد كاملًا بالعربية والإنجليزية"} variant="soft" onPress={() => setExpanded(value => !value)} />
    {expanded ? <View style={{ gap: 14 }}><Text selectable style={text}>{contract.organization.legal_name}{"\n"}السجل التجاري: {contract.organization.commercial_registration_number}{"\n"}الرقم الضريبي: {contract.organization.vat_number || "غير مسجل في العقد"}{"\n"}{contract.organization.legal_address}{"\n"}الشارح: {contract.instructor.fullName}</Text><Text selectable style={text}>المباشرة: {contract.employment.startDate} · النهاية: {contract.employment.endDate || "غير محددة"}{"\n"}مكان العمل: {contract.employment.workLocation}{"\n"}الساعات الأسبوعية: {contract.employment.weeklyHours}{"\n"}الجنسية: {contract.employment.nationality}</Text><Text selectable style={text}>{contract.termsAr}</Text><Text selectable style={text}>التجربة والتقييم: {contract.trialTermsAr}</Text><Text selectable style={text}>الدفع: {contract.employment.paymentTermsAr}{"\n"}المزايا: {contract.employment.benefitsAr}</Text><Text selectable style={en}>{contract.termsEn}</Text><Text selectable style={en}>Trial and evaluation: {contract.trialTermsEn}{"\n"}Payment: {contract.employment.paymentTermsEn}{"\n"}Benefits: {contract.employment.benefitsEn}</Text>{contract.signedAt ? <Text style={text}>تاريخ التوقيع: {new Date(contract.signedAt).toLocaleString("ar-SA")}</Text> : null}
      {contract.status === "offered" ? <><AppButton title={accepted ? "✓ قرأت جميع البنود وأوافق عليها" : "قرأت جميع البنود وأوافق عليها"} variant={accepted ? "primary" : "soft"} onPress={() => setAccepted(value => !value)} /><AppButton title="إضافة توقيعي" disabled={!accepted || busy} onPress={() => { setMessage(""); setSigning(true); }} /></> : null}
    </View> : null}
    <AppButton title="تحميل نسخة PDF" icon="download-outline" variant="ghost" loading={busy && !signing} disabled={busy} onPress={() => void download()} />
    {message && !signing ? <Text accessibilityLiveRegion="polite" style={text}>{message}</Text> : null}
    <Modal visible={signing} transparent animationType="slide" onRequestClose={close}><View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: 18 }}><ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: "95%", backgroundColor: colors.surface, borderRadius: 20 }} contentContainerStyle={{ padding: 18, gap: 12 }}><Text style={{ ...text, fontWeight: "800", fontSize: 20 }}>توقيع نسخة العقد {contract.version}</Text><Text style={text}>أؤكد أنني قرأت البنود المعروضة وأوافق عليها. يؤكد إدخال كلمة المرور هذا الإجراء باسم حسابي.</Text><SignaturePad value={signature} onChange={setSignature} disabled={busy} /><Field label="كلمة مرور حساب الشارح" value={password} onChangeText={setPassword} secureTextEntry inputDirection="ltr" maxLength={128} editable={!busy} />{message ? <Text accessibilityRole="alert" style={{ ...text, color: colors.danger }}>{message}</Text> : null}<AppButton title="تأكيد التوقيع" loading={busy} disabled={!password || signature.flat().length < 12} onPress={() => void sign()} /><AppButton title="إلغاء والعودة للقراءة" variant="ghost" disabled={busy} onPress={close} /></ScrollView></View></Modal>
  </Card>;
}
