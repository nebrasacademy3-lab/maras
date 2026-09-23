import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Card } from "@/src/components/ui";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { ADMIN_SELF_SECURITY, visibleAdminNavigation } from "@/src/lib/admin-navigation";
import { useTheme } from "@/src/providers/ThemeProvider";

const groupIcons = {
  home: "grid-outline",
  education: "library-outline",
  students: "people-outline",
  finance: "wallet-outline",
  communication: "chatbubbles-outline",
  website: "globe-outline",
  security: "shield-checkmark-outline",
  operations: "pulse-outline",
} as const satisfies Record<string, React.ComponentProps<typeof Ionicons>["name"]>;

export function AdminNavigation({ selected, permissions, owner, onSelect }: {
  selected: string;
  permissions: string[];
  owner: boolean;
  onSelect: (id: string) => void;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = React.useState(false);
  const groups = visibleAdminNavigation(permissions, owner);
  const group = groups.find(candidate => candidate.items.some(item => item.id === selected));
  const activeGroup = group || groups[0];
  const isSecurity = selected === ADMIN_SELF_SECURITY.id;
  return <Card style={{ gap: 14, paddingHorizontal: 0, paddingVertical: 17, marginBottom: 6 }}>
    <View style={{ paddingHorizontal: 18, flexDirection: "row-reverse", gap: 12, alignItems: "center" }}>
      <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="apps-outline" color={colors.primary} size={22} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 18, fontWeight: "900", textAlign: "right" }}>مساحة العمل</Text>
        <Text style={{ color: colors.textSoft, fontSize: 12, textAlign: "right", lineHeight: 19 }}>أقسامك المصرح بها فقط</Text>
      </View>
    </View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={({ pressed }) => ({ marginHorizontal: 18, minHeight: 48, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: colors.surfaceAlt, paddingHorizontal: 14, opacity: pressed ? .78 : 1 })}>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800", textAlign: "right" }}>{isSecurity ? "حسابي وأماني" : activeGroup ? activeGroup.title + " · " + (activeGroup.items.find(item => item.id === selected)?.title || "اختر مهمة") : "اختر قسمًا"}</Text>
      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
    </Pressable>
    {expanded ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row-reverse", gap: 8, paddingHorizontal: 18, paddingVertical: 2 }}>
      {groups.map(candidate => {
        const active = !isSecurity && candidate.id === activeGroup?.id;
        return <Pressable key={candidate.id} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={candidate.title} onPress={() => onSelect(candidate.items[0]!.id)} style={({ pressed }) => ({ minHeight: 48, borderRadius: 16, paddingHorizontal: 14, flexDirection: "row-reverse", alignItems: "center", gap: 7, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surfaceAlt, opacity: pressed ? .82 : 1 })}>
          <Ionicons name={groupIcons[candidate.id as keyof typeof groupIcons] || "albums-outline"} size={18} color={active ? colors.onPrimary : colors.primary} />
          <Text style={{ color: active ? colors.onPrimary : colors.text, fontSize: 13, fontWeight: "800" }}>{candidate.title}</Text>
        </Pressable>;
      })}
    </ScrollView> : null}
    {expanded && activeGroup && !isSecurity ? <View style={{ paddingHorizontal: 18, gap: 9 }}>
      <Text style={{ color: colors.textSoft, fontSize: 12, lineHeight: 20, textAlign: "right" }}>{activeGroup.description}</Text>
      <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 }}>
        {activeGroup.items.map(item => {
          const active = item.id === selected;
          return <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={item.title} onPress={() => { onSelect(item.id); setExpanded(false); }} style={({ pressed }) => ({ width: width >= 700 ? "48%" : "100%", minHeight: 54, flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 13, borderRadius: 15, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.surfaceAlt : colors.surface, opacity: pressed ? .78 : 1 })}>
            <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: active ? colors.primary : colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}><Ionicons name={active ? "checkmark" : "arrow-forward"} size={17} color={active ? colors.onPrimary : colors.primary} /></View>
            <Text style={{ color: active ? colors.primary : colors.text, fontSize: 14, fontWeight: active ? "900" : "700", textAlign: "right", flex: 1 }}>{item.title}</Text>
          </Pressable>;
        })}
      </View>
    </View> : null}
    <View style={{ paddingHorizontal: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: isSecurity }} onPress={() => { onSelect(ADMIN_SELF_SECURITY.id); setExpanded(false); }} style={({ pressed }) => ({ minHeight: 48, flexDirection: "row-reverse", alignItems: "center", gap: 10, opacity: pressed ? .7 : 1 })}>
        <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
        <Text style={{ flex: 1, color: isSecurity ? colors.primary : colors.text, fontSize: 14, fontWeight: "800", textAlign: "right" }}>حسابي وأماني</Text>
        <Ionicons name="chevron-back" size={18} color={colors.textSoft} />
      </Pressable>
    </View>
  </Card>;
}
