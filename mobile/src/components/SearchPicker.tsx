import { Ionicons } from "@expo/vector-icons";
import React, { useDeferredValue, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { useReduceMotion } from "@/src/components/ui";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

export type PickerItem = { key: string; label: string; detail?: string };
function normalize(value: string) {
  return value.normalize("NFKD").toLocaleLowerCase().replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").trim();
}
type Props = { label: string; value?: string; items: PickerItem[]; placeholder: string; onSelect: (item: PickerItem) => void; disabled?: boolean; hideLabel?: boolean; onClear?: () => void };

export function SearchPicker({ label, value, items, placeholder, onSelect, disabled = false, hideLabel = false, onClear }: Props) {
  const { colors } = useTheme();
  const { direction, rowDirection, textAlign, language, t } = useLanguage();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const selected = useMemo(() => items.find((item) => item.key === value), [items, value]);
  const clearSelection = onClear || (/اختياري|optional/i.test(label) ? () => onSelect({ key: "", label: "" }) : undefined);
  const indexed = useMemo(() => open ? items.map((item) => ({ item, text: normalize(`${item.label} ${t(item.label)} ${item.detail || ""} ${item.key}`) })) : [], [items, open, t]);
  const rows = useMemo(() => {
    const tokens = normalize(deferredQuery).split(/\s+/).filter(Boolean);
    return indexed.filter((entry) => tokens.every((token) => entry.text.includes(token))).map((entry) => entry.item);
  }, [indexed, deferredQuery]);
  const close = () => { setOpen(false); setQuery(""); };
  const tablet = width >= 700;

  return <View style={[styles.wrap, { direction }]}>
    {!hideLabel ? <Text style={[styles.label, { color: colors.text, textAlign }]}>{label}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={`${t(label)}: ${t(selected?.label || placeholder)}`} accessibilityHint={language === "ar" ? "افتح القائمة وابحث عن الاختيار" : "Open and search choices"} accessibilityState={{ disabled, expanded: open }} disabled={disabled} onPress={() => { setQuery(""); setOpen(true); }} style={({ pressed }) => [styles.select, { flexDirection: rowDirection, backgroundColor: colors.surface, borderColor: open ? colors.primary : colors.border, opacity: disabled ? .5 : pressed ? .8 : 1 }]}>
      <View style={[styles.searchIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="search-outline" size={17} color={colors.primary} /></View>
      <Text numberOfLines={2} style={[styles.selectText, { textAlign, color: selected ? colors.text : colors.textSoft }]}>{selected?.label || placeholder}</Text>
      <Ionicons name="chevron-down" size={17} color={colors.textSoft} />
    </Pressable>
    <Modal visible={open} animationType={reduceMotion ? "none" : "fade"} transparent onRequestClose={close} supportedOrientations={["portrait", "landscape"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.modalShade, { direction, backgroundColor: colors.overlay, justifyContent: tablet ? "center" : "flex-end", paddingTop: insets.top + 12, paddingHorizontal: tablet ? 24 : 0 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق قائمة الاختيار" : "Close choices"} />
        <View accessibilityViewIsModal style={[styles.sheet, tablet && styles.tabletSheet, { maxHeight: height - insets.top - 24, height: height * .8, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={[styles.sheetHead, { flexDirection: rowDirection }]}><View style={styles.heading}><Text style={[styles.sheetTitle, { color: colors.text }]}>{label}</Text><Text style={[styles.hint, { color: colors.textSoft }]}>{language === "ar" ? "ابحث بالاسم أو بأي جزء منه" : "Search by name or a keyword"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={close} style={[styles.close, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="close" size={21} color={colors.text} /></Pressable></View>
          <View style={[styles.search, { flexDirection: rowDirection, backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="search-outline" size={21} color={colors.primary} /><TextInput value={query} onChangeText={setQuery} placeholder={language === "ar" ? `ابحث في ${label}` : `Search ${t(label)}`} placeholderTextColor={colors.textSoft} autoCorrect={false} autoCapitalize="none" returnKeyType="search" accessibilityLabel={language === "ar" ? "البحث في الاختيارات" : "Search choices"} onKeyPress={(event) => { if (event.nativeEvent.key === "Escape") close(); }} style={[styles.input, { color: colors.text, textAlign }]} />{query ? <Pressable onPress={() => setQuery("")} accessibilityRole="button" accessibilityLabel={language === "ar" ? "مسح البحث" : "Clear search"} style={styles.clear}><Ionicons name="close-circle" size={20} color={colors.textSoft} /></Pressable> : null}</View>
          <View style={[styles.resultHead, { flexDirection: rowDirection }]}><Text style={[styles.resultCount, { color: colors.textSoft }]}>{language === "ar" ? `${rows.length} اختيار` : `${rows.length} choices`}</Text>{clearSelection && value ? <Pressable onPress={() => { clearSelection(); close(); }} accessibilityRole="button"><Text style={[styles.clearSelection, { color: colors.primary }]}>{language === "ar" ? "مسح الاختيار" : "Clear selection"}</Text></Pressable> : null}</View>
          <FlatList data={rows} keyExtractor={(item) => item.key} extraData={value} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" initialNumToRender={12} maxToRenderPerBatch={16} windowSize={7} contentContainerStyle={styles.list} renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: value === item.key }} onPress={() => { onSelect(item); close(); }} style={({ pressed }) => [styles.row, { flexDirection: rowDirection, backgroundColor: value === item.key ? colors.surfaceAlt : colors.surface, borderColor: value === item.key ? colors.primary : colors.border, opacity: pressed ? .72 : 1 }]}><View style={styles.rowCopy}><Text style={[styles.rowTitle, { textAlign, color: colors.text }]}>{item.label}</Text>{item.detail ? <Text style={[styles.rowDetail, { textAlign, color: colors.textSoft }]}>{item.detail}</Text> : null}</View><Ionicons name={value === item.key ? "checkmark-circle" : "ellipse-outline"} size={22} color={value === item.key ? colors.primary : colors.border} /></Pressable>} ListEmptyComponent={<View style={styles.empty}><Ionicons name="search-outline" size={32} color={colors.textSoft} /><Text style={[styles.emptyTitle, { color: colors.text }]}>{language === "ar" ? "لا توجد نتائج مطابقة" : "No matching choices"}</Text><Text style={[styles.hint, { color: colors.textSoft }]}>{language === "ar" ? "جرّب اسمًا أقصر أو امسح البحث" : "Try a shorter name or clear the search"}</Text></View>} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

export function SearchChoice({ values, selected, labels, onChange, label = "الاختيارات" }: { values: string[]; selected: string; labels?: Record<string, string>; onChange: (value: string) => void; label?: string }) {
  return <SearchPicker label={label} hideLabel value={selected} placeholder="اختر من القائمة" items={values.map((key) => ({ key, label: labels?.[key] || key }))} onSelect={(item) => onChange(item.key)} />;
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 14, minWidth: 0 }, label: { fontSize: 12, fontWeight: "800" },
  select: { minHeight: 56, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, alignItems: "center", gap: 10 }, searchIcon: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" }, selectText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 21, fontWeight: "700" },
  modalShade: { flex: 1, alignItems: "center" }, sheet: { width: "100%", flexShrink: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 20, overflow: "hidden" }, tabletSheet: { maxWidth: 620, borderRadius: 28 },
  sheetHead: { alignItems: "center", gap: 16, marginBottom: 18 }, heading: { flex: 1 }, sheetTitle: { fontSize: 20, lineHeight: 29, fontWeight: "900" }, hint: { fontSize: 11, lineHeight: 19, marginTop: 4 }, close: { minWidth: 44, minHeight: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  search: { minHeight: 54, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", gap: 10 }, input: { flex: 1, minWidth: 0, minHeight: 52, fontSize: 14 }, clear: { minHeight: 44, minWidth: 32, alignItems: "center", justifyContent: "center" },
  resultHead: { alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }, resultCount: { fontSize: 11 }, clearSelection: { fontSize: 11, fontWeight: "800" }, list: { paddingBottom: 12 }, row: { minHeight: 66, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 8, alignItems: "center", gap: 12 }, rowCopy: { flex: 1, minWidth: 0 }, rowTitle: { fontSize: 14, lineHeight: 22, fontWeight: "800" }, rowDetail: { fontSize: 11, lineHeight: 18, marginTop: 4 }, empty: { paddingVertical: 38, alignItems: "center", gap: 8 }, emptyTitle: { fontSize: 16, fontWeight: "800" },
});
