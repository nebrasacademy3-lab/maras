import React from "react";
import { Field } from "@/src/components/ui";
import { SearchPicker } from "@/src/components/SearchPicker";
import { INSTRUCTOR_COUNTRIES, INSTRUCTOR_QUALIFICATIONS, type InstructorProfileInput } from "@/src/lib/instructor";

export function InstructorProfileFields({ value, onChange, disabled = false }: { value: InstructorProfileInput; onChange: (value: InstructorProfileInput) => void; disabled?: boolean }) {
  const set = <K extends keyof InstructorProfileInput>(key: K, next: InstructorProfileInput[K]) => onChange({ ...value, [key]: next });
  return <>
    <SearchPicker placeholder="اختر الدولة" label="الدولة" value={value.country} items={INSTRUCTOR_COUNTRIES} disabled={disabled} onSelect={item => set("country", item.key)} />
    <SearchPicker placeholder="اختر الجنس" label="الجنس" value={value.gender} items={[{ key: "male", label: "ذكر" }, { key: "female", label: "أنثى" }]} disabled={disabled} onSelect={item => set("gender", item.key as "male" | "female")} />
    <SearchPicker placeholder="اختر المؤهل" label="المؤهل" value={value.qualification} items={INSTRUCTOR_QUALIFICATIONS} disabled={disabled} onSelect={item => set("qualification", item.key)} />
    <Field label="التخصص أو مجال الخبرة" value={value.specialty} onChangeText={text => set("specialty", text)} maxLength={160} editable={!disabled} />
    <Field label="العنوان بالتفصيل" value={value.address} onChangeText={text => set("address", text)} placeholder="الدولة، المدينة، الحي والعنوان" maxLength={1000} multiline editable={!disabled} />
    <Field label="نبذة عن قدرتك على التدريس" value={value.bio} onChangeText={text => set("bio", text)} placeholder="خبرتك، أسلوبك في الشرح، وتجاربك التعليمية (30 حرفًا على الأقل قبل التقديم)" maxLength={4000} multiline numberOfLines={4} editable={!disabled} />
    <Field label="المواد التي يمكنك شرحها" value={value.teachingSubjects} onChangeText={text => set("teachingSubjects", text)} placeholder="المواد والتخصصات والمستويات التي تتقنها" maxLength={3000} multiline editable={!disabled} />
    <SearchPicker placeholder="اختر نظام العمل" label="نظام العمل المفضل" value={value.compensationModel} items={[{ key: "hourly", label: "حسب ساعات الشرح", detail: "الأجر وعدد الساعات يحددان في العقد" }, { key: "course", label: "حسب المادة كاملة", detail: "قيمة المادة وتسليماتها تحدد في العقد" }]} disabled={disabled} onSelect={item => set("compensationModel", item.key as "hourly" | "course")} />
  </>;
}
