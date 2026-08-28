import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, router } from "expo-router";
import React, { useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { FeatureDisabledNotice, FeatureDisabledState, usePlatformControls } from "@/src/components/PlatformControls";
import { AppButton, Card, EmptyState, ErrorState, LoadingState, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody, STORE_MODE } from "@/src/lib/api";
import { checkoutIntent, clearCheckoutAttempt, getCheckoutAttemptKey } from "@/src/lib/checkout-attempt";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Course } from "@/src/types";

export default function Cart() {
  const { user, loading: authLoading, offline, token, authError, refresh } = useAuth();
  const { colors } = useTheme();
  const controls = usePlatformControls();
  const purchasesEnabled = controls.enabled("purchases");
  const client = useQueryClient();
  const [coupon, setCoupon] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [busy, setBusy] = useState("");
  const cart = useQuery({ queryKey: ["cart", user?.id], queryFn: () => api<{ items: Course[]; subtotal: number; count: number }>("/api/cart"), enabled: !authLoading && user?.role === "student" && STORE_MODE !== "reader" });
  if (authLoading) return <Screen><LoadingState label="جارٍ استعادة سلتك..." /></Screen>;
  if (!user && offline && token) return <Screen><AppHeader title="السلة" back /><ErrorState title="تعذر استعادة الجلسة" text={authError || "تحقق من اتصالك ثم أعد المحاولة."} onRetry={() => void refresh()} /></Screen>;
  if (!user) return <Redirect href="/(auth)/login?return_to=%2Fcart" />;
  if (user.role !== "student") return <Screen><AppHeader title="السلة" back /><EmptyState icon="lock-closed-outline" title="السلة لحساب الطالب" text="استخدم حساب طالب لإضافة المواد وإدارة الاشتراكات." /></Screen>;
  if (STORE_MODE === "reader") return <Screen><AppHeader title="الاشتراكات" back /><FeatureDisabledState title="لا توجد سلة داخل هذه النسخة" message="نسخة التطبيق مخصصة لمشاهدة الدروس المجانية والمواد المفعلة مسبقًا. لا تعرض سلة أو كوبونات أو دفعًا للمحتوى الرقمي." /></Screen>;
  const items = cart.data?.items || [];
  const subtotal = cart.data?.subtotal || 0;
  const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  async function remove(courseSlug: string) { setBusy(courseSlug); try { await api("/api/cart", { method: "POST", body: jsonBody({ courseSlug, active: false }) }); setDiscount(0); setAppliedCoupon(""); setCouponMessage(""); await client.invalidateQueries({ queryKey: ["cart"] }); } catch (reason) { setCouponMessage(reason instanceof ApiError ? reason.message : "تعذر حذف المادة"); } finally { setBusy(""); } }
  async function applyCoupon() { const code = coupon.trim().toUpperCase(); if (!purchasesEnabled || !code || !items.length) return; setCouponMessage("جارٍ التحقق..."); try { const result = await api<{ discount: number; code: string; label?: string }>("/api/coupons/validate", { method: "POST", body: jsonBody({ code, courseSlugs: items.map((item) => item.slug) }) }); setDiscount(result.discount); setAppliedCoupon(result.code || code); setCouponMessage(`${result.label || "تم تطبيق الخصم"} بنجاح`); } catch (reason) { setDiscount(0); setAppliedCoupon(""); setCouponMessage(reason instanceof ApiError ? reason.message : "الكود غير صالح أو منتهي"); } }
  async function pay() {
    if (!user?.profileCompleted) { router.push("/complete-profile?return_to=%2Fcart"); return; }
    if (!items.length || busy || !purchasesEnabled || STORE_MODE === "reader") return;
    setBusy("pay");
    const intent = checkoutIntent(items.map((item) => item.slug), appliedCoupon);
    try {
      const attemptKey = await getCheckoutAttemptKey(intent);
      for (let retry = 0; retry < 4; retry += 1) {
        const result = await api<{ checkoutUrl?: string; mode?: string; pending?: boolean }>("/api/checkout", { method: "POST", headers: { "idempotency-key": attemptKey }, body: jsonBody({ courseSlugs: items.map((item) => item.slug), coupon: appliedCoupon || undefined }), timeoutMs: 30_000 });
        if (result.mode === "complete") { await clearCheckoutAttempt(intent); router.replace("/(tabs)/learning"); return; }
        if (result.checkoutUrl && result.mode === "live") { await import("expo-linking").then((Linking) => Linking.openURL(result.checkoutUrl!)); return; }
        if (result.pending) { setCouponMessage("تم تثبيت محاولة الدفع، وجارٍ استعادة رابطها الآمن..."); await new Promise((resolve) => setTimeout(resolve, 1500 + retry * 500)); continue; }
        throw new ApiError("لم تُرجع بوابة الدفع رابطًا صالحًا", 502);
      }
      setCouponMessage("تم حفظ محاولة الدفع بأمان. أعد الضغط لاستعادة الرابط نفسه.");
    } catch (reason) {
      if (reason instanceof ApiError && reason.newAttemptRequired) await clearCheckoutAttempt(intent);
      setCouponMessage(reason instanceof ApiError ? reason.message : "تعذر بدء الدفع");
    } finally { setBusy(""); }
  }
  if (cart.isLoading) return <Screen><LoadingState label="نجهّز سلتك التعليمية..." /></Screen>;
  if (cart.isError) return <Screen><AppHeader title="السلة" back /><ErrorState title="تعذر تحميل السلة" text="لم نتمكن من جلب مواد السلة الآن." onRetry={() => void cart.refetch()} /></Screen>;
  if (!items.length) return <Screen><AppHeader title="السلة" subtitle="شراء منظم" back /><EmptyState title="السلة فارغة" text="أضف المواد التي تريدها من الكتالوج وستجدها هنا." action={purchasesEnabled ? <AppButton title="استكشف المواد" onPress={() => router.push("/(tabs)/courses")} /> : <FeatureDisabledNotice title="الشراء متوقف مؤقتًا" message={controls.messageFor("يمكنك مراجعة السلة وإزالة المواد، وسيعود الشراء عند إعادة تفعيله من الإدارة.")} />} /></Screen>;
  return <Screen><AppHeader title="السلة" subtitle={`${items.length} مواد مختارة`} back /><View style={[styles.intro, { backgroundColor: colors.primary }]}><Ionicons name="bag-handle-outline" size={26} color="#FFF" /><Text style={styles.introTitle}>سلتك التعليمية</Text><Text style={styles.introCopy}>{purchasesEnabled ? "راجع المواد ثم ادفع دفعة واحدة عبر Tap." : "يمكنك مراجعة المواد وإزالتها حتى تعود خدمة الشراء."}</Text></View>{items.map((course) => <Card key={course.slug} style={styles.item}><View style={[styles.art, { backgroundColor: colors.primary }]}><Text style={styles.artText}>{course.icon}</Text></View><View style={styles.itemInfo}><Text style={[styles.context, { color: colors.textSoft }]}>{course.university} · {course.specialty}</Text><Pressable onPress={() => router.push({ pathname: "/course/[slug]", params: { slug: course.slug } })}><Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{course.title}</Text></Pressable><Text style={[styles.meta, { color: colors.textSoft }]}>{course.price} ر.س · {course.lessons} درسًا</Text></View><Pressable onPress={() => void remove(course.slug)} disabled={busy === course.slug} style={styles.remove}><Ionicons name="trash-outline" size={18} color={colors.danger} /></Pressable></Card>)}<Card style={styles.summary}><Text style={[styles.summaryTitle, { color: colors.text }]}>ملخص الطلب</Text><View style={styles.line}><Text style={{ color: colors.textSoft }}>المواد ({items.length})</Text><Text style={{ color: colors.text }}>{subtotal} ر.س</Text></View><View style={styles.line}><Text style={{ color: colors.textSoft }}>الخصم</Text><Text style={{ color: colors.success }}>-{discount} ر.س</Text></View><View style={[styles.totalLine, { borderTopColor: colors.border }]}><Text style={[styles.totalLabel, { color: colors.text }]}>الإجمالي</Text><Text style={[styles.total, { color: colors.primary }]}>{total} ر.س</Text></View>{purchasesEnabled ? <><View style={[styles.coupon, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><Ionicons name="pricetag-outline" size={18} color={colors.textSoft} /><TextInput value={coupon} onChangeText={(value) => { setCoupon(value); setDiscount(0); setAppliedCoupon(""); setCouponMessage(""); }} placeholder="كود الخصم" placeholderTextColor={colors.textSoft} style={[styles.input, { color: colors.text }]} autoCapitalize="characters" /><Pressable onPress={() => void applyCoupon()}><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }}>تطبيق</Text></Pressable></View>{couponMessage ? <Text style={[styles.feedback, { color: discount ? colors.success : colors.danger }]}>{couponMessage}</Text> : null}<AppButton title={`الدفع عبر Tap · ${total} ر.س`} icon="card-outline" loading={busy === "pay"} onPress={() => void pay()} /></> : <FeatureDisabledNotice title="الكوبونات والدفع متوقفة مؤقتًا" message={controls.messageFor("يمكنك إزالة أي مادة من السلة، ولن يبدأ دفع أو يطبّق كوبون حتى تعيد الإدارة تشغيل الخدمة.")} />}</Card></Screen>;
}

const styles = StyleSheet.create({ intro: { borderRadius: 22, padding: 20, marginBottom: 15 }, introTitle: { color: "#FFF", fontSize: 22, fontWeight: "900", textAlign: "right", marginTop: 8 }, introCopy: { color: "rgba(255,255,255,.82)", fontSize: 10, textAlign: "right", marginTop: 3 }, item: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 9 }, art: { width: 54, height: 54, borderRadius: 15, alignItems: "center", justifyContent: "center" }, artText: { color: "#FFF", fontSize: 22 }, itemInfo: { flex: 1, alignItems: "flex-end" }, context: { fontSize: 8, textAlign: "right" }, title: { fontSize: 12, fontWeight: "900", textAlign: "right", marginTop: 4 }, meta: { fontSize: 9, marginTop: 5 }, remove: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, summary: { marginTop: 11 }, summaryTitle: { fontSize: 17, fontWeight: "900", textAlign: "right", marginBottom: 14 }, line: { flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 11, fontSize: 11 }, totalLine: { flexDirection: "row-reverse", justifyContent: "space-between", borderTopWidth: 1, paddingTop: 14, marginTop: 3, marginBottom: 14 }, totalLabel: { fontSize: 13, fontWeight: "900" }, total: { fontSize: 22, fontWeight: "900" }, coupon: { minHeight: 47, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, flexDirection: "row-reverse", alignItems: "center", gap: 7 }, input: { flex: 1, minHeight: 42, fontSize: 11, textAlign: "right" }, feedback: { fontSize: 10, textAlign: "right", marginVertical: 8 } });
