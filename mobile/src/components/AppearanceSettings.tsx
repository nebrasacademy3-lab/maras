import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { SearchPicker } from "@/src/components/SearchPicker";
import { Card, SectionTitle } from "@/src/components/ui";
import { useTheme, type FontScale } from "@/src/providers/ThemeProvider";
import { paletteLabels, type PaletteId, type ThemeMode } from "@/src/theme/colors";
import { useLanguage } from "@/src/providers/LanguageProvider";

const fontScales: { value: FontScale; label: string }[] = [{ value: .9, label: "صغير" }, { value: 1, label: "قياسي" }, { value: 1.1, label: "كبير" }, { value: 1.2, label: "أكبر" }];

export function AppearanceSettings() {
  const { colors, dark, mode, palette, fontScale, setMode, setPalette, setFontScale } = useTheme();
  const { language, setLanguage, direction, rowDirection } = useLanguage();
  return <View style={[styles.wrap, { direction }]}>
    <SectionTitle title="إعدادات المظهر" subtitle="خصص الألوان وحجم النص كما يناسبك، وتطبق مباشرة في كل أجزاء التطبيق." />
    <Card>
      <SearchPicker label="اللغة" value={language} placeholder="اختر اللغة" items={[{ key: "ar", label: "العربية" }, { key: "en", label: "English" }]} onSelect={(item) => void setLanguage(item.key as "ar" | "en")} />
      <SearchPicker label="الوضع" value={mode} placeholder="اختر الوضع" items={[{ key: "system", label: "تلقائي" }, { key: "light", label: "فاتح" }, { key: "dark", label: "ليلي" }]} onSelect={(item) => setMode(item.key as ThemeMode)} />
      <SearchPicker label="الثيم اللوني" value={palette} placeholder="اختر الألوان" items={Object.entries(paletteLabels).map(([key, label]) => ({ key, label }))} onSelect={(item) => setPalette(item.key as PaletteId)} />
      <SearchPicker label="حجم الخط" value={String(fontScale)} placeholder="اختر حجم النص" items={fontScales.map((item) => ({ key: String(item.value), label: item.label, detail: `${Math.round(item.value * 100)}%` }))} onSelect={(item) => setFontScale(Number(item.key) as FontScale)} />
      <View style={[styles.preview, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <View style={[styles.previewHead, { flexDirection: rowDirection }]}><View style={[styles.previewIcon, { backgroundColor: colors.primary }]}><Ionicons name={dark ? "moon-outline" : "sunny-outline"} size={22} color="#FFF" /></View><Text style={[styles.previewTitle, { color: colors.text }]}>مساحة تشبهك</Text></View>
        <Text style={[styles.previewCopy, { color: colors.textSoft }]}>هكذا تظهر الألوان وحجم الخط في تجربتك.</Text>
        <View style={[styles.swatches, { flexDirection: rowDirection }]}>{[colors.primary, colors.success, colors.warning, colors.text].map((color, index) => <View key={index} style={[styles.swatch, { backgroundColor: color }]} />)}</View>
      </View>
    </Card>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 5, marginBottom: 18 }, preview: { borderWidth: 1, borderRadius: 20, padding: 18 }, previewHead: { alignItems: "center", gap: 12 }, previewIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" }, previewTitle: { fontSize: 21, fontWeight: "900", flex: 1 }, previewCopy: { fontSize: 13, lineHeight: 23, marginTop: 12 }, swatches: { alignItems: "center", gap: 8, marginTop: 17 }, swatch: { width: 28, height: 28, borderRadius: 10 },
});
