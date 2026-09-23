import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { useWindowDimensions, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { useTheme } from "@/src/providers/ThemeProvider";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function WorkspaceHero({ eyebrow, title, description, icon, children }: {
  eyebrow: string;
  title: string;
  description: string;
  icon: IconName;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  return <LinearGradient
    colors={[colors.hero, colors.heroEnd]}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={{ borderRadius: 28, borderCurve: "continuous", padding: compact ? 18 : 24, overflow: "hidden", marginTop: 10, marginBottom: 18, gap: 16 }}
  >
    <View pointerEvents="none" style={{ position: "absolute", width: 190, height: 190, borderRadius: 95, borderWidth: 1, borderColor: "rgba(255,255,255,.13)", top: -92, left: -62 }} />
    <View pointerEvents="none" style={{ position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(255,255,255,.05)", bottom: -68, right: 18 }} />
    <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 14 }}>
      <View style={{ width: 52, height: 52, borderRadius: 17, backgroundColor: "rgba(255,255,255,.14)", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={26} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ color: "#D5E8FF", fontSize: 12, fontWeight: "800", textAlign: "right", letterSpacing: .3 }}>{eyebrow}</Text>
        <Text accessibilityRole="header" style={{ color: "#FFFFFF", fontSize: compact ? 25 : 29, lineHeight: compact ? 36 : 40, fontWeight: "900", textAlign: "right" }}>{title}</Text>
        <Text style={{ color: "#E2ECFB", fontSize: 14, lineHeight: 23, textAlign: "right" }}>{description}</Text>
      </View>
    </View>
    {children ? <View style={{ gap: 10 }}>{children}</View> : null}
  </LinearGradient>;
}

export function WorkspaceStat({ value, label, icon }: { value: string; label: string; icon: IconName }) {
  const { colors } = useTheme();
  return <View style={{ flex: 1, minWidth: 100, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, borderCurve: "continuous", padding: 14, gap: 8 }}>
    <View style={{ width: 37, height: 37, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} color={colors.primary} size={19} /></View>
    <Text style={{ color: colors.text, fontSize: 24, fontWeight: "900", textAlign: "right", fontVariant: ["tabular-nums"] }}>{value}</Text>
    <Text style={{ color: colors.textSoft, fontSize: 12, lineHeight: 18, textAlign: "right" }}>{label}</Text>
  </View>;
}

export function WorkspaceStatus({ label, tone = "primary" }: { label: string; tone?: "primary" | "success" | "warning" | "danger" }) {
  const { colors, dark } = useTheme();
  const color = tone === "warning" ? (dark ? "#FFCB75" : "#8A4E00") : tone === "danger" && !dark ? "#B4233A" : tone === "success" && !dark ? "#067A54" : colors[tone];
  return <View style={{ alignSelf: "flex-end", minHeight: 34, borderRadius: 17, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: `${color}1A`, justifyContent: "center" }}>
    <Text style={{ color, fontSize: 12, fontWeight: "900", textAlign: "right" }}>{label}</Text>
  </View>;
}
