/** Shared, data-only administrative form contract. The server revalidates every field. */
export type ControlOption = { value: string; label: string };
export type ControlField = { key: string; label: string; type: "text" | "textarea" | "number" | "select"; required?: boolean; maxLength?: number; min?: number; max?: number; options?: ControlOption[]; choices?: string; initial?: string };
export type StudentControlAction = { action: string; group: string; label: string; fields: ControlField[]; warning?: string };
export type StudentControlsData = { actions: StudentControlAction[]; choices: Record<string, ControlOption[]>; profile: Record<string, string>; limits?: Record<string, number> };
const choices = (key: string, label: string, source: string): ControlField => ({ key, label, type: "select", required: true, choices: source });
const status = (values: Array<[string,string]>, key = "status", label = "الحالة الجديدة"): ControlField => ({ key, label, type: "select", required: true, options: values.map(([value,label]) => ({value,label})) });
const days: ControlField = { key: "days", label: "المدة بالأيام (للمنح أو التمديد)", type: "number", min: 1, max: 3650, initial: "30", required: true };
export const STUDENT_CONTROL_ACTIONS: StudentControlAction[] = [
 { action:"profile.update", group:"profile", label:"تعديل بيانات الطالب", warning:"تغيير رقم الجوال يلغي توثيقه السابق. البريد والتوثيق لا يتغيران يدويًا.", fields:[{key:"fullName",label:"الاسم الكامل",type:"text",required:true,maxLength:160},{key:"phone",label:"الجوال الدولي (اختياري)",type:"text",maxLength:24}, {...choices("universitySlug","الجامعة","institutions"),required:false},{key:"specialty",label:"التخصص (من تخصصات الجامعة)",type:"text",maxLength:160},{...choices("academicLevel","المستوى الأكاديمي","levels"),required:false}] },
 { action:"account.status", group:"profile", label:"تفعيل أو إيقاف الحساب", warning:"إيقاف الحساب ينهي جلساته ويعطّل إرسال Push إليه، ولا يحذف الأجهزة المسجلة.", fields:[status([["active","تفعيل"],["suspended","إيقاف"]])] },
 { action:"course.grant", group:"subscriptions", label:"منح مادة للطالب", warning:"منحة إدارية وليست عملية دفع. الاشتراك الموجود يُدار من خيار تعديل الوصول.", fields:[choices("courseSlug","المادة","courses"),days] },
 { action:"course.access", group:"subscriptions", label:"إدارة اشتراك موجود", fields:[choices("id","الاشتراك","subscriptions"),status([["pause","إيقاف مؤقت"],["resume","استئناف"],["extend","تمديد"],["revoke","إلغاء الوصول"]],"operation","الإجراء"),days] },
 { action:"ai.grant", group:"ai", label:"منح أدوات مراس", warning:"هذه هدية إدارية لا تنشئ طلبًا ماليًا أو فاتورة مدفوعة.", fields:[days] },
 { action:"ai.status", group:"ai", label:"تغيير حالة استحقاق أدوات مراس", warning:"تغيير استحقاق مستقل لا يلغي تلقائيًا استحقاقًا آخر ناتجًا عن مادة أو هدية.", fields:[choices("id","الاستحقاق","entitlements"),status([["active","تفعيل"],["revoked","إلغاء الاستحقاق"]])] },
 { action:"waitlist.cancel", group:"interest", label:"إلغاء تنبيه مادة بطلب الطالب", fields:[choices("id","قائمة انتظار المادة","waitlist")] },
 { action:"track.cancel", group:"interest", label:"إلغاء اهتمام بمسار بطلب الطالب", fields:[choices("id","المسار","tracks")] },
 { action:"favorite.remove", group:"interest", label:"إزالة من المفضلة بطلب الطالب", fields:[choices("id","المادة","favorites")] },
 { action:"cart.remove", group:"interest", label:"إزالة من السلة بطلب الطالب", fields:[choices("id","المادة","cart")] },
 { action:"support.reply", group:"support", label:"الرد على تذكرة أو إضافة ملاحظة", fields:[choices("id","التذكرة","support"),status([["public","رد للطالب"],["internal","ملاحظة داخلية لا تظهر للطالب"]],"visibility","ظهور الرد"),{key:"body",label:"نص الرد",type:"textarea",required:true,maxLength:5000}] },
 { action:"support.status", group:"support", label:"تغيير حالة التذكرة", fields:[choices("id","التذكرة","support"),status([["new","جديدة"],["open","مفتوحة"],["waiting","بانتظار الطالب"],["resolved","محلولة"],["closed","مغلقة"]])] },
 { action:"request.status", group:"requests", label:"متابعة طلب مادة", warning:"إعلان الإتاحة يتطلب اختيار مادة منشورة ومفتوحة للاشتراك. إشعار الطالب يُحفظ في الطابور.", fields:[choices("id","طلب المادة","requests"),status([["new","جديد"],["reviewing","قيد المراجعة"],["planned","مخطط"],["producing","قيد الإنتاج"],["available","متاح"],["declined","متعذر"]]),{...choices("courseSlug","المادة المجهزة (مطلوبة عند الإتاحة)","courses"),required:false}] },
 { action:"notification.send", group:"notifications", label:"إرسال إشعار مخصص", fields:[{key:"title",label:"العنوان",type:"text",required:true,maxLength:160},{key:"body",label:"النص",type:"textarea",required:true,maxLength:3000},{key:"actionUrl",label:"مسار داخلي اختياري مثل /courses",type:"text",maxLength:300},status([["inbox","داخل المنصة فقط"],["push","داخل المنصة وإشعار الجهاز"]],"channel","طريقة الإرسال")] },
 { action:"notification.cancel", group:"notifications", label:"إلغاء إشعار مخصص لم يُرسل", warning:"لا يسحب إشعارًا سبق أن قبله المزود أو وصل للجهاز.", fields:[choices("id","الإشعار","notifications")] },
 { action:"notification.retry", group:"notifications", label:"إعادة محاولة Push فاشل", fields:[choices("id","الإشعار","notifications")] },
 { action:"session.revoke", group:"sessions", label:"إنهاء جلسة محددة", fields:[choices("id","الجلسة","sessions")] },
 { action:"session.revokeAll", group:"sessions", label:"إنهاء جميع الجلسات", warning:"يسجّل خروج الطالب من الويب والتطبيق، ولا يحرر أجهزة التسجيل الدائم.", fields:[] },
 { action:"push.disable", group:"sessions", label:"إيقاف إرسال الإشعارات لجهاز", warning:"إعادة التسجيل تتطلب موافقة الطالب من جهازه.", fields:[choices("id","جهاز الإشعارات","pushDevices")] },
];
export class StudentControlError extends Error {
 constructor(message: string, public status = 400, public code = "STUDENT_CONTROL_INVALID") { super(message); this.name = "StudentControlError"; }
}
export function safeInternalActionUrl(value: string) {
 if (!value) return null;
 if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) throw new StudentControlError("رابط الإشعار يجب أن يكون مسارًا داخليًا آمنًا");
 let decoded: string; try { decoded = decodeURIComponent(value); } catch { throw new StudentControlError("الرابط غير صالح"); }
 if (decoded.startsWith("//") || /[\\\u0000-\u0020]/.test(decoded) || /%(?:2f|5c|00)/i.test(decoded)) throw new StudentControlError("الرابط غير صالح");
 const parsed = new URL(value, "https://local.invalid");
 const decodedPath = new URL(decoded, "https://local.invalid").pathname;
 if (parsed.origin !== "https://local.invalid" || /^\/(?:api|admin)(?:\/|$)/i.test(decodedPath)) throw new StudentControlError("استخدم صفحة عامة أو صفحة طالب وليس مسارًا إداريًا");
 return parsed.pathname + parsed.search + parsed.hash;
}
export function parseStudentControl(payload: Record<string, unknown>) {
 const definition = STUDENT_CONTROL_ACTIONS.find(item => item.action === payload.action);
 if (!definition) throw new StudentControlError("الإجراء غير مدعوم");
 const operationKey = typeof payload.operationKey === "string" ? payload.operationKey : "";
 if (!/^[a-zA-Z0-9_-]{16,100}$/.test(operationKey)) throw new StudentControlError("معرّف العملية غير صالح");
 const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
 if (reason.length < 3 || reason.length > 500) throw new StudentControlError("اكتب سببًا واضحًا من 3 إلى 500 حرف");
 const fields: Record<string,string|number> = {};
 for (const field of definition.fields) {
   const raw = payload[field.key];
   if (raw != null && typeof raw !== "string" && typeof raw !== "number") throw new StudentControlError(`قيمة ${field.label} غير صالحة`);
   const text = raw == null ? "" : String(raw).trim();
   if (field.required && !text) throw new StudentControlError(`أدخل ${field.label}`);
   if (field.type === "number") {
     const n = Number(text);
     if (!Number.isSafeInteger(n) || n < (field.min ?? 0) || n > (field.max ?? 1_000_000)) throw new StudentControlError(`قيمة ${field.label} خارج المسموح`);
     fields[field.key] = n;
   } else {
     if (text.length > (field.maxLength ?? 300) || /[\u0000]/.test(text)) throw new StudentControlError(`قيمة ${field.label} غير صالحة`);
     if (field.options && !field.options.some(o => o.value === text)) throw new StudentControlError(`اختيار ${field.label} غير صالح`);
     fields[field.key] = text;
   }
 }
 if ("id" in fields && (!/^\d{1,10}$/.test(String(fields.id)) || !Number.isSafeInteger(Number(fields.id)) || Number(fields.id) < 1 || Number(fields.id) > 2147483647)) throw new StudentControlError("معرّف السجل غير صالح");
 if (definition.action === "profile.update") {
   if (String(fields.fullName).length < 2) throw new StudentControlError("الاسم قصير جدًا");
   const phone = String(fields.phone).replace(/[\s()-]/g, "");
   if (phone && !/^\+?[1-9]\d{7,14}$/.test(phone)) throw new StudentControlError("رقم الجوال غير صالح؛ استخدم الصيغة الدولية");
   fields.phone = phone;
   if (typeof payload.expectedUpdatedAt !== "string" || !payload.expectedUpdatedAt || payload.expectedUpdatedAt.length > 80) throw new StudentControlError("حدّث ملف الطالب قبل حفظ بياناته",409,"STALE_RECORD");
   fields.expectedUpdatedAt = payload.expectedUpdatedAt;
 }
 if (definition.action === "notification.send") fields.actionUrl = safeInternalActionUrl(String(fields.actionUrl)) || "";
 return { action: definition.action, reason, operationKey, fields };
}
export function canonicalControlJson(value: unknown): string {
 if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
 if (Array.isArray(value)) return `[${value.map(canonicalControlJson).join(",")}]`;
 return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonicalControlJson(v)}`).join(",")}}`;
}
