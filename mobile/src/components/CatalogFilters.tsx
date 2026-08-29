import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, SearchBox } from "@/src/components/ui";
import { useTheme } from "@/src/providers/ThemeProvider";

export type CatalogScope = "personal" | "university" | "specialty" | "all";
export type CatalogFilterOption = { key: string; label: string; detail?: string };

const scopeOptions: { key: CatalogScope; title: string; text: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "personal", title: "المناسب لي", text: "جامعتي وتخصصي", icon: "sparkles-outline" },
  { key: "university", title: "جامعتي", text: "كل تخصصاتها", icon: "school-outline" },
  { key: "specialty", title: "تخصصي", text: "في كل الجهات", icon: "book-outline" },
  { key: "all", title: "كل المواد", text: "دون تقييد", icon: "library-outline" },
];

type Props = {
  scope: CatalogScope;
  onScopeChange: (scope: CatalogScope) => void;
  university: string;
  specialty: string;
  allUniversitiesKey: string;
  allSpecialtiesKey: string;
  universities: CatalogFilterOption[];
  specialties: CatalogFilterOption[];
  onUniversityChange: (key: string) => void;
  onSpecialtyChange: (key: string) => void;
  onReset: () => void;
  specialtiesLoading?: boolean;
  allowPersonal?: boolean;
};

type Page = "main" | "university" | "specialty";

export function CatalogFilters({ scope, onScopeChange, university, specialty, allUniversitiesKey, allSpecialtiesKey, universities, specialties, onUniversityChange, onSpecialtyChange, onReset, specialtiesLoading = false, allowPersonal = true }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page>("main");
  const [query, setQuery] = useState("");
  const universityLabel = universities.find((item) => item.key === university)?.label || allUniversitiesKey;
  const specialtyLabel = specialties.find((item) => item.key === specialty)?.label || specialty;
  const activeCount = Number(university !== allUniversitiesKey) + Number(specialty !== allSpecialtiesKey) + Number(scope !== "all");
  const options = page === "university" ? universities : specialties;
  const selectedKey = page === "university" ? university : specialty;
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ar");
    if (!needle) return options;
    return options.filter((item) => `${item.label} ${item.detail || ""}`.toLocaleLowerCase("ar").includes(needle));
  }, [options, query]);
  const close = () => { setOpen(false); setPage("main"); setQuery(""); };
  const select = (item: CatalogFilterOption) => {
    if (page === "university") onUniversityChange(item.key); else onSpecialtyChange(item.key);
    setPage("main");
    setQuery("");
  };
  return <>
    <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.summaryCopy}>
        <Text style={[styles.summaryTitle, { color: colors.text }]}>{scopeOptions.find((item) => item.key === scope)?.title || "كل المواد"}</Text>
        <Text numberOfLines={1} style={[styles.summaryText, { color: colors.textSoft }]}>{universityLabel} · {specialtyLabel}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`فتح الفلاتر${activeCount ? `، ${activeCount} مفعلة` : ""}`} onPress={() => setOpen(true)} style={[styles.trigger, { backgroundColor: activeCount ? colors.primary : colors.surfaceAlt }]}>
        <Ionicons name="options-outline" size={19} color={activeCount ? "#FFFFFF" : colors.primary} />
        <Text style={[styles.triggerText, { color: activeCount ? "#FFFFFF" : colors.primary }]}>الفلاتر{activeCount ? ` ${activeCount}` : ""}</Text>
      </Pressable>
    </View>
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <SafeAreaView edges={["bottom"]} style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel={page === "main" ? "إغلاق الفلاتر" : "رجوع"} onPress={() => page === "main" ? close() : (setPage("main"), setQuery(""))} style={[styles.headerButton, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={page === "main" ? "close" : "arrow-forward"} size={22} color={colors.text} /></Pressable>
            <View style={styles.headerCopy}><Text style={[styles.sheetTitle, { color: colors.text }]}>{page === "main" ? "تخصيص النتائج" : page === "university" ? "اختر الجامعة أو الكلية" : "اختر التخصص"}</Text><Text style={[styles.sheetSubtitle, { color: colors.textSoft }]}>{page === "main" ? "خيارات مرتبة في مكان واحد" : `${filtered.length} خيارًا مطابقًا`}</Text></View>
          </View>
          {page === "main" ? <>
            {allowPersonal ? <><Text style={[styles.groupLabel, { color: colors.textSoft }]}>نطاق العرض</Text><View style={styles.scopeGrid}>{scopeOptions.map((item) => <Pressable key={item.key} onPress={() => onScopeChange(item.key)} style={[styles.scope, { backgroundColor: scope === item.key ? colors.primary : colors.surface, borderColor: scope === item.key ? colors.primary : colors.border }]}><Ionicons name={item.icon} size={21} color={scope === item.key ? "#FFFFFF" : colors.primary} /><Text style={[styles.scopeTitle, { color: scope === item.key ? "#FFFFFF" : colors.text }]}>{item.title}</Text><Text style={[styles.scopeText, { color: scope === item.key ? "rgba(255,255,255,.8)" : colors.textSoft }]}>{item.text}</Text></Pressable>)}</View></> : null}
            <Text style={[styles.groupLabel, { color: colors.textSoft }]}>التصفية اليدوية</Text>
            <SelectionRow icon="school-outline" label="الجامعة أو الكلية" value={universityLabel} onPress={() => setPage("university")} />
            <SelectionRow icon="book-outline" label="التخصص" value={specialtiesLoading ? "جارٍ تحميل التخصصات..." : specialtyLabel} disabled={specialtiesLoading} onPress={() => setPage("specialty")} />
            <View style={styles.actions}><AppButton title="عرض النتائج" icon="checkmark-outline" onPress={close} /><AppButton title="إعادة الضبط" icon="refresh-outline" variant="ghost" onPress={() => { onReset(); close(); }} /></View>
          </> : <View style={styles.listPage}>
            <SearchBox value={query} onChangeText={setQuery} placeholder={page === "university" ? "ابحث باسم الجامعة أو المنطقة" : "ابحث باسم التخصص"} />
            <FlatList data={filtered} keyExtractor={(item) => item.key} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} renderItem={({ item }) => <Pressable onPress={() => select(item)} style={[styles.option, { backgroundColor: colors.surface, borderColor: selectedKey === item.key ? colors.primary : colors.border }]}><View style={styles.optionCopy}><Text style={[styles.optionTitle, { color: colors.text }]}>{item.label}</Text>{item.detail ? <Text style={[styles.optionDetail, { color: colors.textSoft }]}>{item.detail}</Text> : null}</View>{selectedKey === item.key ? <Ionicons name="checkmark-circle" size={23} color={colors.primary} /> : <Ionicons name="chevron-back" size={18} color={colors.textSoft} />}</Pressable>} ListEmptyComponent={<View style={styles.empty}><Ionicons name="search-outline" size={29} color={colors.textSoft} /><Text style={[styles.emptyText, { color: colors.textSoft }]}>لا توجد نتائج مطابقة. جرّب كلمة أقصر.</Text></View>} />
          </View>}
        </SafeAreaView>
      </View>
    </Modal>
  </>;
}

function SelectionRow({ icon, label, value, onPress, disabled = false }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; value: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.selection, { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? .55 : 1 }]}><View style={[styles.selectionIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={icon} size={20} color={colors.primary} /></View><View style={styles.selectionCopy}><Text style={[styles.selectionLabel, { color: colors.textSoft }]}>{label}</Text><Text numberOfLines={1} style={[styles.selectionValue, { color: colors.text }]}>{value}</Text></View><Ionicons name="chevron-back" size={19} color={colors.textSoft} /></Pressable>;
}

const styles = StyleSheet.create({
  summary: { minHeight: 68, borderWidth: 1, borderRadius: 18, padding: 10, marginTop: 10, flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  summaryCopy: { flex: 1, alignItems: "flex-end" }, summaryTitle: { fontSize: 12, fontWeight: "900" }, summaryText: { width: "100%", fontSize: 9, marginTop: 4 },
  trigger: { minWidth: 88, minHeight: 44, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6 }, triggerText: { fontSize: 10, fontWeight: "900", textAlign: "center" },
  backdrop: { flex: 1, justifyContent: "flex-end" }, sheet: { height: "88%", borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 18, paddingTop: 17, overflow: "hidden" },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 11, marginBottom: 18 }, headerButton: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" }, headerCopy: { flex: 1, alignItems: "flex-end" }, sheetTitle: { fontSize: 19, fontWeight: "900" }, sheetSubtitle: { fontSize: 9, marginTop: 3 },
  groupLabel: { fontSize: 10, fontWeight: "900", marginBottom: 8, marginTop: 7 }, scopeGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 12 }, scope: { width: "48.5%", minHeight: 92, borderWidth: 1, borderRadius: 17, padding: 12, alignItems: "flex-end" }, scopeTitle: { fontSize: 11, fontWeight: "900", marginTop: 7 }, scopeText: { fontSize: 8, marginTop: 2 },
  selection: { minHeight: 68, borderWidth: 1, borderRadius: 17, padding: 10, marginBottom: 9, flexDirection: "row-reverse", alignItems: "center", gap: 10 }, selectionIcon: { width: 43, height: 43, borderRadius: 13, alignItems: "center", justifyContent: "center" }, selectionCopy: { flex: 1, alignItems: "flex-end" }, selectionLabel: { fontSize: 8 }, selectionValue: { width: "100%", fontSize: 11, fontWeight: "900", marginTop: 4 }, actions: { gap: 8, marginTop: 12 },
  listPage: { flex: 1 }, list: { paddingTop: 12, paddingBottom: 35 }, option: { minHeight: 66, borderWidth: 1, borderRadius: 17, padding: 12, marginBottom: 9, flexDirection: "row-reverse", alignItems: "center", gap: 10 }, optionCopy: { flex: 1, alignItems: "flex-end" }, optionTitle: { fontSize: 12, fontWeight: "900" }, optionDetail: { fontSize: 9, marginTop: 4 }, empty: { minHeight: 230, alignItems: "center", justifyContent: "center", gap: 10 }, emptyText: { fontSize: 10, textAlign: "center" },
});
