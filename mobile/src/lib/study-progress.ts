/** Shared, non-sensitive progress contract. No model/key IDs or invented ETA. */
export type StudyProgress = {phase: string; totalUnits: number; completedUnits: number; totalParts: number; completedParts: number; percent: number};
export function normalizeStudyProgress(value: unknown, status: string): StudyProgress | null {
  if (!value || typeof value!=="object" || Array.isArray(value)) return null;
  const row=value as Record<string,unknown>;
  if (typeof row.phase!=="string" || !["preparing","processing","waiting","replanning","assembling","complete","failed","review","pausing","paused","cancelled"].includes(row.phase)) return null;
  const count=(value: unknown,max=8192)=>typeof value==="number" && Number.isSafeInteger(value) ? Math.max(0,Math.min(max,value)) : 0;
  const totalUnits=count(row.totalUnits),totalParts=count(row.totalParts);
  return {phase:row.phase,totalUnits,totalParts,completedUnits:Math.min(totalUnits,count(row.completedUnits)),completedParts:Math.min(totalParts,count(row.completedParts)),percent:count(row.percent,status==="succeeded" ? 100 : 99)};
}
export function studyProgressLabel(progress: StudyProgress | null) {
  if (!progress) return "";
  const phases: Record<string,string>={preparing:"تجهيز المصدر",processing:"معالجة الأجزاء",waiting:"بانتظار توفر المعالجة؛ التقدم محفوظ",replanning:"إعادة تقسيم الجزء المتعثر دون فقد المعتمد",assembling:"تجميع النتيجة والتحقق منها",complete:"اكتملت النتيجة المحفوظة؛ تجهيز PDF مرحلة منفصلة",failed:"تعذر إكمال الجزء الحالي",review:"يلزم مراجعة الجزء المتعثر",pausing:"جارٍ حفظ الجزء الحالي ثم التوقف",paused:"متوقف مؤقتًا؛ الأجزاء المعتمدة محفوظة",cancelled:"أُلغي الطلب"};
  const counts=progress.totalParts ? ` · ${progress.completedParts} من ${progress.totalParts} جزءًا معتمدًا · ${progress.completedUnits} من ${progress.totalUnits} وحدة مصدر` : "";
  return (phases[progress.phase] || "طلبك محفوظ")+counts;
}
