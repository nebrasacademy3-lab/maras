import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import React from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { SectionTitle, useReduceMotion } from "@/src/components/ui";
import { absoluteUrl, api } from "@/src/lib/api";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { PublicPartner, PublicPartnersResponse } from "@/src/types";

const kindLabels: Record<PublicPartner["kind"], string> = {
  partner: "شريك المنصة",
  accreditation: "اعتماد أو ترخيص",
  payment: "شريك دفع",
};

function destination(partner: PublicPartner) {
  if (partner.kind === "accreditation") return partner.verificationUrl;
  return partner.destinationUrl || partner.verificationUrl;
}

function actionLabel(partner: PublicPartner) {
  if (partner.kind === "accreditation") return "التحقق الرسمي";
  if (partner.kind === "payment") return "عرض التفاصيل";
  return "زيارة الشريك";
}

export function HomePartners() {
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const { colors } = useTheme();
  const { direction, rowDirection } = useLanguage();
  const query = useQuery({
    queryKey: ["public-partners"],
    queryFn: () => api<PublicPartnersResponse>("/api/public/partners"),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
  const partners = (query.data?.partners || []).slice(0, 12);
  if (!partners.length) return null;
  const cardWidth = Math.min(282, Math.max(216, width * .7));
  const hasAccreditation = partners.some((partner) => partner.kind === "accreditation");
  const hasNonAccreditation = partners.some((partner) => partner.kind !== "accreditation");
  const sectionTitle = hasAccreditation
    ? hasNonAccreditation ? "الشركاء والاعتمادات" : "الاعتمادات والتراخيص"
    : partners.every((partner) => partner.kind === "payment") ? "شركاء الدفع" : "شركاء المنصة";

  return <View style={styles.section}>
    <SectionTitle
      title={sectionTitle}
      subtitle="تعرّف على شركاء مراس والجهات المرتبطة بخدماتها"
    />
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.rail, { direction, flexDirection: rowDirection }]}
    >
      {partners.map((partner) => {
        const target = destination(partner);
        return <Pressable
          accessibilityRole={target ? "link" : undefined}
          accessibilityLabel={target ? `${actionLabel(partner)}: ${partner.name}` : partner.name}
          disabled={!target}
          key={partner.id}
          onPress={() => target ? void Linking.openURL(target) : undefined}
          style={({ pressed }) => [
            styles.card,
            {
              width: cardWidth,
              direction,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? .78 : 1,
            },
          ]}
        >
          <View style={[styles.cardHead, { flexDirection: rowDirection }]}>
            <View style={[styles.logoTile, { borderColor: colors.border }]}>
              <Image
                accessibilityLabel={`شعار ${partner.name}`}
                cachePolicy="memory-disk"
                contentFit="contain"
                recyclingKey={String(partner.id)}
                source={{ uri: absoluteUrl(partner.logo) }}
                style={styles.logo}
                transition={reduceMotion ? 0 : 120}
              />
            </View>
            <View style={styles.headCopy}>
              <View style={[styles.kind, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons
                  name={partner.kind === "accreditation" ? "ribbon-outline" : partner.kind === "payment" ? "card-outline" : "people-outline"}
                  size={13}
                  color={colors.primary}
                />
                <Text style={[styles.kindText, { color: colors.primary }]}>{kindLabels[partner.kind]}</Text>
              </View>
              <Text style={[styles.name, { color: colors.text }]}>{partner.name}</Text>
            </View>
          </View>
          {partner.description ? <Text style={[styles.description, { color: colors.textSoft }]}>{partner.description}</Text> : null}
          {partner.credentialNumber ? <View style={[styles.credential, { borderColor: colors.border }]}>
            <Text style={[styles.credentialLabel, { color: colors.textSoft }]}>رقم الاعتماد أو الترخيص</Text>
            <Text selectable style={[styles.credentialValue, { color: colors.text }]}>{partner.credentialNumber}</Text>
          </View> : null}
          {target ? <View style={[styles.action, { flexDirection: rowDirection }]}>
            <Text style={[styles.actionText, { color: colors.primary }]}>{actionLabel(partner)}</Text>
            <Ionicons name="open-outline" size={14} color={colors.primary} />
          </View> : null}
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: 2 },
  rail: { flexDirection: "row", paddingEnd: 18 },
  card: { minHeight: 196, borderWidth: 1, borderRadius: 22, padding: 14, marginEnd: 11 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 11 },
  logoTile: { width: 64, height: 64, flexShrink: 0, borderWidth: 1, borderRadius: 18, padding: 7, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logo: { width: "100%", height: "100%" },
  headCopy: { flex: 1, alignItems: "flex-start" },
  kind: { maxWidth: "100%", minHeight: 27, borderRadius: 999, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  kindText: { flexShrink: 1, fontSize: 10, fontWeight: "900" },
  name: { fontSize: 13, lineHeight: 20, fontWeight: "900", textAlign: "right", writingDirection: "rtl", marginTop: 6 },
  description: { fontSize: 11, lineHeight: 20, textAlign: "right", writingDirection: "rtl", marginTop: 10 },
  credential: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 8, alignItems: "flex-start" },
  credentialLabel: { fontSize: 7, fontWeight: "800", textAlign: "right" },
  credentialValue: { fontSize: 9, fontWeight: "900", textAlign: "left", writingDirection: "ltr", marginTop: 3 },
  action: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: "auto", paddingTop: 11 },
  actionText: { fontSize: 9, fontWeight: "900" },
});
