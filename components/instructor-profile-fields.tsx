"use client";
import { INSTRUCTOR_QUALIFICATIONS } from "@/lib/instructor-policy";
import styles from "./instructor-workspace.module.css";

export type InstructorFields = { country: string; gender: string; qualification: string; specialty: string; address: string; bio: string; teachingSubjects: string; compensationModel: string };
export const emptyInstructorFields: InstructorFields = { country: "SA", gender: "", qualification: "", specialty: "", address: "", bio: "", teachingSubjects: "", compensationModel: "hourly" };
const qualifications: Record<string, string> = { student: "طالب جامعي", diploma: "دبلوم", bachelor: "بكالوريوس", master: "ماجستير", doctorate: "دكتوراه", professional: "مؤهل أو خبرة مهنية", other: "مؤهل آخر" };
const countries = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const countryNames = new Intl.DisplayNames(["ar"], { type: "region" });
const countryOptions = countries.map(code => ({ code, label: countryNames.of(code) || code })).sort((a,b) => a.label.localeCompare(b.label, "ar"));

export function InstructorProfileFields({ value, onChange, includeExperience = true }: { value: InstructorFields; onChange: (value: InstructorFields) => void; includeExperience?: boolean }) {
  function update(key: keyof InstructorFields, next: string) { onChange({ ...value, [key]: next }); }
  return <div className={styles.fields}>
    <label>الدولة<select required name="country" value={value.country} onChange={e => update("country", e.target.value)} autoComplete="country">{countryOptions.map(country => <option key={country.code} value={country.code}>{country.label}</option>)}</select></label>
    <label>الجنس<select required name="gender" value={value.gender} onChange={e => update("gender", e.target.value)}><option value="">اختر</option><option value="male">ذكر</option><option value="female">أنثى</option></select></label>
    <label>المؤهل الحالي<select required name="qualification" value={value.qualification} onChange={e => update("qualification", e.target.value)}><option value="">اختر المؤهل</option>{INSTRUCTOR_QUALIFICATIONS.map(item => <option key={item} value={item}>{qualifications[item]}</option>)}</select></label>
    <label>التخصص<input required minLength={2} maxLength={160} name="specialty" value={value.specialty} onChange={e => update("specialty", e.target.value)} placeholder="مثال: الرياضيات أو علوم الحاسب" /></label>
    <label className={styles.fullWidth}>العنوان<textarea required minLength={10} maxLength={1000} name="address" value={value.address} onChange={e => update("address", e.target.value)} autoComplete="street-address" rows={2} placeholder="المدينة، الحي، الشارع والعنوان التفصيلي" /></label>
    {includeExperience && <><label className={styles.fullWidth}>نبذة عن خبرتك في الشرح<textarea name="bio" rows={4} maxLength={4000} value={value.bio} onChange={e => update("bio", e.target.value)} placeholder="حدّثنا عن أسلوبك وخبرتك وما يميز شرحك. يلزم 30 حرفًا على الأقل عند تقديم الطلب." /></label><label className={styles.fullWidth}>المواد التي تستطيع شرحها<textarea name="teachingSubjects" rows={3} maxLength={3000} value={value.teachingSubjects} onChange={e => update("teachingSubjects", e.target.value)} placeholder="أسماء المواد، رموزها إن وجدت، والمستوى الدراسي" /></label></>}
    <label className={styles.fullWidth}>نظام العمل المفضل<select name="compensationModel" value={value.compensationModel} onChange={e => update("compensationModel", e.target.value)}><option value="hourly">حسب ساعات الشرح المعتمدة</option><option value="course">حسب المادة المكتملة</option></select><small>تحدد الإدارة الأجر وتفاصيل الاحتساب في عقد العمل قبل البدء.</small></label>
  </div>;
}
