import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { View } from "react-native";
import { AppButton, Card, SectionTitle } from "@/src/components/ui";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { WorkspaceStatus } from "@/src/components/staff-workspace-ui";
import { api } from "@/src/lib/api";
import { INSTRUCTOR_ASSIGNMENT_LABELS, type InstructorAssignment } from "@/src/lib/instructor-assignments";
import { useTheme } from "@/src/providers/ThemeProvider";

export function InstructorAssignments({ userId }: { userId: number }) {
  const { colors } = useTheme();
  const query = useQuery({
    queryKey: ["instructor-assignments", userId],
    queryFn: ({ signal }) => api<{ assignments: InstructorAssignment[] }>("/api/instructor/assignments", { signal }),
    retry: false,
    staleTime: 15_000,
  });
  const assignments = query.data?.assignments || [];
  return <View style={{ gap: 12, marginVertical: 18 }}>
    <SectionTitle title="المواد المسندة إليك" subtitle="خطة المادة ودروسها جاهزة؛ أكمل الشرح ثم أرسله للمراجعة" />
    {query.isLoading ? <Card style={{ minHeight: 96, justifyContent: "center" }}><Text style={{ color: colors.textSoft, fontSize: 14, textAlign: "right" }}>جارٍ تحميل موادك…</Text></Card>
      : query.isError ? <Card style={{ gap: 10 }}><Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14, lineHeight: 23, textAlign: "right" }}>{query.error instanceof Error ? query.error.message : "تعذر تحميل المواد"}</Text><AppButton title="إعادة المحاولة" onPress={() => void query.refetch()} /></Card>
        : assignments.length ? assignments.map(item => {
          const tone = item.status === "published" ? "success" : item.status === "changes_requested" ? "warning" : item.status === "cancelled" ? "danger" : "primary";
          return <Card key={item.id} style={{ gap: 13 }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 11 }}>
              <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}><Ionicons name="book-outline" color={colors.primary} size={23} /></View>
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={{ color: colors.text, fontSize: 19, lineHeight: 27, fontWeight: "900", textAlign: "right" }}>{item.courseTitle}</Text>
                <WorkspaceStatus label={INSTRUCTOR_ASSIGNMENT_LABELS[item.status] || item.status} tone={tone} />
              </View>
            </View>
            {item.reviewNotes ? <View style={{ borderRadius: 14, backgroundColor: colors.surfaceAlt, padding: 12 }}><Text selectable style={{ color: colors.warning, fontSize: 13, lineHeight: 22, textAlign: "right" }}>ملاحظة المراجعة: {item.reviewNotes}</Text></View> : null}
            <AppButton title="فتح المادة والدروس" icon="arrow-forward-outline" variant="soft" onPress={() => router.push({ pathname: "/instructor-assignment/[id]", params: { id: String(item.id) } } as Href)} />
          </Card>;
        }) : <Card style={{ gap: 9, alignItems: "flex-end" }}><Ionicons name="library-outline" color={colors.primary} size={27} /><Text style={{ color: colors.text, fontSize: 16, fontWeight: "900", textAlign: "right" }}>لا توجد مواد مسندة بعد</Text><Text style={{ color: colors.textSoft, fontSize: 14, lineHeight: 24, textAlign: "right" }}>ستظهر هنا بعد اعتماد العقد وإسناد المادة من الإدارة.</Text></Card>}
    <AppButton title="تحديث المواد" icon="refresh-outline" variant="ghost" loading={query.isFetching} onPress={() => void query.refetch()} />
  </View>;
}
