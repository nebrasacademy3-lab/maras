import React, { useState } from "react";
import { View } from "react-native";
import { ScaledText as Text } from "./ScaledText";
import { AppButton, Field } from "./ui";
import { catalogPage } from "@/src/lib/catalog-pagination";
import { useTheme } from "@/src/providers/ThemeProvider";
export function useCatalogPage<T>(rows: readonly T[], searchable: (row: T) => string) {
  const [query, setQuery] = useState(""); const [index, setIndex] = useState(0);
  return { ...catalogPage(rows, query, index, searchable), query, search: (value: string) => { setQuery(value); setIndex(0); }, setPage: setIndex };
}
export function AdminCatalogPager({ page, label }: { page: { query: string; search: (query: string) => void; current: number; pages: number; total: number; setPage: (page: number) => void }; label: string }) {
  const { colors } = useTheme();
  return <View style={{ marginBottom: 14, gap: 9 }}><Field label={`البحث في ${label}`} value={page.query} onChangeText={page.search} icon="search-outline" placeholder="اكتب الاسم أو المعرّف" /><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}><AppButton full={false} title="السابق" variant="soft" disabled={page.current === 0} onPress={() => page.setPage(page.current - 1)} /><Text accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: "center", fontSize: 12, color: colors.textSoft }}>{page.total} نتيجة · {page.current + 1}/{page.pages}</Text><AppButton full={false} title="التالي" variant="soft" disabled={page.current + 1 >= page.pages} onPress={() => page.setPage(page.current + 1)} /></View></View>;
}
