import React, { useState } from "react";
import { View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, Card, Field } from "@/src/components/ui";
import { useTheme } from "@/src/providers/ThemeProvider";
type Student = { id: number; email: string; fullName: string; universitySlug: string | null; specialty: string | null; academicLevel: string | null; updatedAt: string };
export function AdminStudentActions({ student, catalog, run, busy }: { student: Student; catalog: { courses: { slug: string; title: string }[]; institutions: { slug: string; name: string }[] }; run: (payload: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const { colors } = useTheme(); const [kind, setKind] = useState("profile"); const [fullName, setFullName] = useState(student.fullName); const [universitySlug, setUniversity] = useState(student.universitySlug || ""); const [specialty, setSpecialty] = useState(student.specialty || ""); const [academicLevel, setLevel] = useState(student.academicLevel || ""); const [courseSlug, setCourse] = useState(""); const [grantType, setGrantType] = useState("complimentary"); const [price, setPrice] = useState(""); const [reason, setReason] = useState(""); const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [operationKey, setKey] = useState(() => `mobile_grant_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  async function save() {
    const payload = kind === "profile" ? { action: "updateStudentProfile", id: student.id, fullName, universitySlug, specialty, academicLevel, expectedUpdatedAt: student.updatedAt, reason }
      : kind === "grant" ? { action: "grantAccess", userEmail: student.email, courseSlug, grantType, price: grantType === "manual_payment" ? Number(price) : 0, reason, operationKey }
      : { action: "createNotification", audience: "user", userEmail: student.email, title, body, pushEnabled: true, presentation: "inbox" };
    if (await run(payload)) { setReason(""); setKey(`mobile_grant_${Date.now()}_${Math.random().toString(36).slice(2)}`); }
  }
  return <Card><Text style={{ color: colors.text, fontWeight: "800", textAlign: "right" }}>إجراءات من ملف الطالب</Text><SearchPicker placeholder="اختر من القائمة" label="الإجراء" value={kind} items={[{ key: "profile", label: "تعديل البيانات الدراسية" }, { key: "grant", label: "منح مادة أو تسجيل دفعة" }, { key: "notification", label: "إرسال إشعار للطالب" }]} onSelect={item => setKind(item.key)} />
    {kind === "profile" && <><Field label="الاسم الكامل" value={fullName} onChangeText={setFullName} /><SearchPicker placeholder="اختر من القائمة" label="الجامعة" value={universitySlug} items={catalog.institutions.map(item => ({ key: item.slug, label: item.name }))} onSelect={item => setUniversity(item.key)} /><Field label="التخصص" value={specialty} onChangeText={setSpecialty} /><Field label="المستوى الدراسي" value={academicLevel} onChangeText={setLevel} /></>}
    {kind === "grant" && <><SearchPicker placeholder="اختر من القائمة" label="المادة" value={courseSlug} items={catalog.courses.map(item => ({ key: item.slug, label: item.title }))} onSelect={item => setCourse(item.key)} /><SearchPicker placeholder="اختر من القائمة" label="نوع المنح" value={grantType} items={[{ key: "complimentary", label: "منحة مجانية" }, { key: "manual_payment", label: "دفعة يدوية مع فاتورة" }]} onSelect={item => setGrantType(item.key)} />{grantType === "manual_payment" && <Field label="المبلغ بالريال" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />}<Text style={{ color: colors.textSoft }}>تستخدم مدة المادة المحددة. يبقى الوصول الدائم دون انتهاء.</Text></>}
    {kind === "notification" ? <><Field label="عنوان الإشعار" value={title} onChangeText={setTitle} /><Field label="نص الإشعار" value={body} onChangeText={setBody} multiline /></> : <Field label="سبب التغيير" value={reason} onChangeText={setReason} multiline />}
    <View><AppButton title="حفظ الإجراء" loading={busy} disabled={kind === "notification" ? title.trim().length < 3 || body.trim().length < 3 : reason.trim().length < 3 || kind === "grant" && (!courseSlug || grantType === "manual_payment" && !(Number(price) > 0))} onPress={() => void save()} /></View>
  </Card>;
}
