import React, { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, router, type Href } from "expo-router";
import { AppHeader } from "@/src/components/AppHeader";
import { InstructorProfileFields } from "@/src/components/instructor-profile-fields";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, Field, LoadingState, Screen } from "@/src/components/ui";
import { INSTRUCTOR_DEFAULT_PROFILE } from "@/src/lib/instructor";
import { authDestination } from "@/src/lib/account-access";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

export default function InstructorRegistrationScreen() {
  const { user, loading, registerInstructor } = useAuth();
  const { colors } = useTheme();
  const [profile, setProfile] = useState({ ...INSTRUCTOR_DEFAULT_PROFILE });
  const [account, setAccount] = useState({ fullName: "", email: "", phone: "+966", password: "" });
  const [accepted, setAccepted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const writing = useRef(false);
  if (loading) return <Screen><LoadingState /></Screen>;
  if (user) return <Redirect href={user.role === "instructor" ? "/instructor" as Href : "/(tabs)/account"} />;
  const valid = accepted && account.fullName.trim().length >= 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email.trim()) && /^\+[1-9]\d{7,14}$/.test(account.phone.trim()) && account.password.length >= 10 && profile.specialty.trim().length >= 2 && profile.address.trim().length >= 10;
  async function submit() {
    if (!valid || writing.current) return;
    writing.current = true; setBusy(true); setMessage("");
    try {
      const result = await registerInstructor({ ...profile, ...account, email: account.email.trim(), fullName: account.fullName.trim(), phone: account.phone.trim(), termsAccepted: true, privacyAccepted: true });
      router.replace(authDestination(result.user, result.next, "/instructor") as Href);
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر إنشاء حساب الشارح. حاول مرة أخرى."); }
    finally { writing.current = false; setBusy(false); }
  }
  return <Screen keyboard><AppHeader title="انضم لفريق مراس كشارح" subtitle="شارك معرفتك. اصنع أثرًا." back />
    <Card style={{ gap: 12, marginBottom: 20, backgroundColor: colors.surfaceAlt }}><Text style={{ color: colors.text, fontSize: 23, fontWeight: "800", textAlign: "right" }}>قدرتك على تبسيط المعرفة هي البداية</Text><Text style={{ color: colors.textSoft, fontSize: 15, lineHeight: 26, textAlign: "right" }}>نرحب بمن يتقن مادته ويستطيع تدريسها، سواء كنت طالبًا أو خريجًا أو صاحب خبرة. بعد تأكيد البريد تكمل المستندات ثم تراجع الإدارة طلبك. الأجر وفترة التجربة وحقوق المحتوى يحددها عقدك قبل بدء العمل.</Text></Card>
    <Field label="الاسم الكامل" value={account.fullName} onChangeText={fullName => setAccount({ ...account, fullName })} maxLength={160} editable={!busy} />
    <Field label="البريد الإلكتروني" value={account.email} onChangeText={email => setAccount({ ...account, email })} keyboardType="email-address" autoCapitalize="none" inputDirection="ltr" maxLength={254} editable={!busy} />
    <Field label="رقم الجوال مع مفتاح الدولة" value={account.phone} onChangeText={phone => setAccount({ ...account, phone: phone.replace(/[^+0-9]/g, "") })} keyboardType="phone-pad" inputDirection="ltr" placeholder="+9665XXXXXXXX" maxLength={16} editable={!busy} />
    <Field label="كلمة المرور" value={account.password} onChangeText={password => setAccount({ ...account, password })} secureTextEntry={!visible} inputDirection="ltr" maxLength={128} autoCapitalize="none" placeholder="10 أحرف على الأقل، مع رقم ورمز خاص" editable={!busy} trailing={<Pressable accessibilityLabel={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onPress={() => setVisible(value => !value)}><Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={22} color={colors.textSoft} /></Pressable>} />
    <InstructorProfileFields value={profile} onChange={setProfile} disabled={busy} />
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} disabled={busy} onPress={() => setAccepted(value => !value)} style={{ flexDirection: "row-reverse", gap: 10, paddingVertical: 16 }}><Ionicons name={accepted ? "checkbox" : "square-outline"} size={26} color={colors.primary} /><Text style={{ flex: 1, color: colors.text, fontSize: 14, lineHeight: 25, textAlign: "right" }}>قرأت وأوافق على شروط الاستخدام وسياسة الخصوصية ومعالجة بيانات طلب الانضمام.</Text></Pressable>
    <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginBottom: 16 }}><AppButton full={false} title="قراءة الشروط" variant="ghost" onPress={() => router.push("/legal?document=terms" as Href)} /><AppButton full={false} title="سياسة الخصوصية" variant="ghost" onPress={() => router.push("/legal?document=privacy" as Href)} /></View>
    {message ? <Text accessibilityRole="alert" style={{ color: colors.danger, textAlign: "right", marginBottom: 15 }}>{message}</Text> : null}
    <AppButton title="إنشاء حساب الشارح وتأكيد البريد" loading={busy} disabled={!valid} onPress={() => void submit()} />
    <AppButton title="لدي حساب شارح — تسجيل الدخول" variant="ghost" onPress={() => router.push("/(auth)/login?return_to=%2Finstructor" as Href)} />
  </Screen>;
}
