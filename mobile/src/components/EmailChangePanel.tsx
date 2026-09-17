import React, { useEffect, useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, Field } from "@/src/components/ui";
import { ApiError, api, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

type ChangeState = {
  active: boolean;
  currentEmail: string;
  newEmail: string;
  currentVerified: boolean;
  newVerified: boolean;
  expiresInSeconds: number;
};

type ApiResult = Partial<ChangeState> & { error?: string; completed?: boolean; email?: string };

export function EmailChangePanel() {
  const { refresh } = useAuth();
  const { colors } = useTheme();
  const [state, setState] = useState<ChangeState>({ active: false, currentEmail: "", newEmail: "", currentVerified: false, newVerified: false, expiresInSeconds: 0 });
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState<"load" | "request" | "current" | "new" | "cancel" | "">("load");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await api<ApiResult>("/api/profile/email");
      setState({
        active: Boolean(data.active),
        currentEmail: data.currentEmail || "",
        newEmail: data.newEmail || "",
        currentVerified: Boolean(data.currentVerified),
        newVerified: Boolean(data.newVerified),
        expiresInSeconds: Number(data.expiresInSeconds || 0),
      });
      if (data.active) setNewEmail(data.newEmail || "");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "تعذر تحميل حالة تغيير البريد");
    } finally {
      setBusy("");
    }
  }
  useEffect(() => { void load(); }, []);

  async function requestChange() {
    if (busy) return;
    setBusy("request"); setError(""); setMessage("");
    try {
      const data = await api<ApiResult>("/api/profile/email", { method: "POST", body: jsonBody({ action: "request", newEmail, currentPassword }) });
      setState({ active: true, currentEmail: data.currentEmail || "", newEmail: data.newEmail || newEmail, currentVerified: false, newVerified: false, expiresInSeconds: Number(data.expiresInSeconds || 0) });
      setCurrentPassword(""); setCurrentCode(""); setNewCode("");
      setMessage("أرسلنا الرمزين إلى البريدين. أدخل كل رمز لإتمام التغيير.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "تعذر بدء تغيير البريد");
    } finally {
      setBusy("");
    }
  }

  async function verify(target: "current" | "new") {
    if (busy) return;
    setBusy(target); setError(""); setMessage("");
    try {
      const data = await api<ApiResult>("/api/profile/email", { method: "POST", body: jsonBody({ action: "verify", target, code: target === "current" ? currentCode : newCode }) });
      if (data.completed) {
        setMessage("تم تغيير البريد بنجاح. ستبقى بياناتك واشتراكاتك محفوظة.");
        setState(value => ({ ...value, active: false, currentEmail: data.email || value.newEmail, newEmail: "", currentVerified: true, newVerified: true }));
        setCurrentCode(""); setNewCode(""); await refresh();
      } else {
        setState(value => ({ ...value, currentVerified: Boolean(data.currentVerified), newVerified: Boolean(data.newVerified) }));
        setMessage(target === "current" ? "تم تأكيد بريدك الحالي. أكّد البريد الجديد." : "تم تأكيد البريد الجديد. أكّد بريدك الحالي.");
        if (target === "current") setCurrentCode(""); else setNewCode("");
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "تعذر تأكيد الرمز");
    } finally {
      setBusy("");
    }
  }

  async function cancel() {
    if (busy) return;
    setBusy("cancel"); setError(""); setMessage("");
    try {
      await api("/api/profile/email", { method: "POST", body: jsonBody({ action: "cancel" }) });
      setState(value => ({ ...value, active: false }));
      setNewEmail(""); setCurrentCode(""); setNewCode("");
      setMessage("أُلغي طلب تغيير البريد");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "تعذر إلغاء الطلب");
    } finally {
      setBusy("");
    }
  }

  return <Card><Text style={{ color: colors.text, fontSize: 17, fontWeight: "900", textAlign: "right", marginBottom: 8 }}>تغيير البريد الإلكتروني</Text>
    <Text style={{ color: colors.textSoft, fontSize: 11, lineHeight: 19, textAlign: "right", marginBottom: 15 }}>نرسل رمزًا إلى البريد الحالي والجديد، وتبقى مشترياتك وتقدمك وفواتيرك مرتبطة بالحساب نفسه.</Text>
    {!state.active
      ? <><Field label="البريد الجديد" value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} inputDirection="ltr" maxLength={180} /><Field label="كلمة المرور الحالية (إن وُجدت)" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" inputDirection="ltr" maxLength={128} /><AppButton title={busy === "request" ? "جارٍ إرسال الرموز…" : "إرسال رموز التأكيد"} loading={busy === "request"} disabled={busy !== "" || busy === "load" || !newEmail.trim()} onPress={() => void requestChange()} /></>
      : <><Text style={{ color: colors.textSoft, fontSize: 11, lineHeight: 20, textAlign: "right", marginBottom: 10 }}>{state.currentVerified ? "تم تأكيد البريد الحالي" : "بانتظار رمز البريد الحالي"} · {state.newVerified ? "تم تأكيد البريد الجديد" : "بانتظار رمز البريد الجديد"}.</Text>{!state.currentVerified ? <><Field label="رمز البريد الحالي" value={currentCode} onChangeText={setCurrentCode} keyboardType="number-pad" inputDirection="ltr" maxLength={6} autoCapitalize="none" /><AppButton title="تأكيد البريد الحالي" loading={busy === "current"} disabled={busy !== "" || currentCode.length !== 6} onPress={() => void verify("current")} /></> : null}{!state.newVerified ? <><Field label="رمز البريد الجديد" value={newCode} onChangeText={setNewCode} keyboardType="number-pad" inputDirection="ltr" maxLength={6} autoCapitalize="none" /><AppButton title="تأكيد البريد الجديد" variant="soft" loading={busy === "new"} disabled={busy !== "" || newCode.length !== 6} onPress={() => void verify("new")} /></> : null}<AppButton title="إلغاء طلب التغيير" variant="ghost" disabled={busy !== ""} onPress={() => void cancel()} /></>}
    {message ? <Text style={{ color: colors.success, fontSize: 11, lineHeight: 19, textAlign: "right", marginTop: 10 }}>{message}</Text> : null}
    {error ? <Text style={{ color: colors.danger, fontSize: 11, lineHeight: 19, textAlign: "right", marginTop: 10 }}>{error}</Text> : null}
  </Card>;
}
