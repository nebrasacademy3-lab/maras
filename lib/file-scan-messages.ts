export const fileScanErrors: Record<string, string> = {
  scanner_not_configured: "خدمة الفحص غير مهيأة. أنشئ خدمة الفحص ثم اضبط عنوانها ورمز الاتصال في مراس.",
  scanner_endpoint_missing: "عنوان خدمة الفحص غير مضاف في خادم مراس.",
  scanner_token_invalid: "رمز الاتصال غير صالح. استخدم سرًا عشوائيًا بطول 32 حرفًا على الأقل وبالقيمة نفسها في الخدمتين.",
  scanner_endpoint_invalid: "عنوان خدمة الفحص غير صالح؛ استخدم عنوان الخدمة الخاصة أو رابط HTTPS دون بيانات دخول أو معاملات إضافية.",
  scanner_endpoint_path: "عنوان الفحص يجب أن ينتهي بـ /scan.",
  scanner_docker_address_on_railway: "العنوان scanner:3001 خاص ببيئة Docker. على Railway أنشئ خدمة فحص مستقلة واستخدم نطاقها الخاص المنتهي بـ .railway.internal.",
  scanner_dns_failed: "تعذر العثور على خدمة الفحص. تأكد أنها منشأة وتعمل في مشروع Railway والبيئة نفسيهما، وأن نطاقها الخاص صحيح.",
  scanner_connection_refused: "خدمة الفحص لا تستقبل الاتصال. راجع تشغيلها ورقم المنفذ واستماعها للشبكة الخاصة.",
  scanner_tls_error: "تعذر التحقق من شهادة الاتصال الآمن بخدمة الفحص.",
  scanner_timeout: "انتهت مهلة الفحص. راجع حالة المحرك وموارده والاتصال قبل إعادة المحاولة.",
  scanner_unavailable: "تعذر الاتصال بخدمة الفحص. اختبر الاتصال وراجع سجلات الخدمة.",
  scanner_engine_unavailable: "وصل الطلب إلى خدمة الفحص، لكن محرك ClamAV لم يصبح جاهزًا أو تعطل. راجع تحميل التواقيع والذاكرة وسجل الخدمة.",
  scanner_busy: "محرك الفحص مشغول الآن. أُبقي الملف في الانتظار لمحاولة لاحقة.",
  scanner_http_401: "رمز الاتصال غير متطابق. ضع قيمة MALWARE_SCAN_TOKEN نفسها في خدمة مراس وخدمة الفحص ثم أعد نشرهما.",
  scanner_http_403: "خدمة الفحص رفضت الطلب. راجع رمز الاتصال وضوابط الوصول إلى الخدمة.",
  scanner_http_404: "رابط خدمة الفحص أو مسار /scan غير صحيح. لا تستخدم رابط موقع مراس بدل خدمة الفحص.",
  scanner_http_413: "خدمة الفحص رفضت حجم الملف. الحد المدعوم 100 ميجابايت.",
  scanner_http_429: "خدمة الفحص حدّت عدد الطلبات؛ ستتم محاولة لاحقة.",
  scanner_http_502: "خدمة الفحص لم تبدأ أو لا تستجيب خلف الاستضافة. راجع سجلات تشغيلها والمنفذ.",
  scanner_http_503: "خدمة الفحص غير جاهزة. راجع تشغيل ClamAV واكتمال تحميل التواقيع والموارد.",
  stored_object_missing: "سجل الملف موجود لكن محتواه مفقود من التخزين الحالي. أعد ربط القرص أو التخزين القديم أو استعد الملف من النسخة الاحتياطية؛ إعادة الفحص وحدها لا تستعيده.",
  storage_read_failed: "تعذرت قراءة الملف من التخزين. راجع ربط القرص أو إعدادات وصلاحيات التخزين؛ هذا ليس خطأ في التوكن الخاص بالفحص.",
  storage_read_timeout: "انتهت مهلة قراءة الملف من التخزين قبل فحصه.",
  stored_size_mismatch: "حجم المحتوى لا يطابق سجل الرفع. تحقق من استعادة الملف الأصلي كاملًا أو أعد رفعه.",
  file_exceeds_scan_limit: "الملف أكبر من حد الفحص المدعوم (100 ميجابايت).",
  scanner_digest_mismatch: "بصمة نتيجة الفحص لا تطابق الملف؛ لم يُسمح بتنزيله.",
  scanner_indeterminate: "رد محرك الفحص غير حاسم؛ لم يُسمح بتنزيل الملف.",
  scanner_invalid_response: "العنوان لا يعيد استجابة خدمة فحص مراس الصحيحة. تحقق من خدمة الفحص ومسار /scan.",
  scanner_unknown_engine: "لم يصدر الرد عن محرك ClamAV المعتمد.",
  scanner_probe_rejected: "لم يجتز اختبار الاتصال فحص المحرك. راجع خدمة الفحص قبل معالجة الملفات.",
};
export function fileScanErrorMessage(code: string | null | undefined) {
  return code ? fileScanErrors[code] || "فشل الفحص. راجع رمز الخطأ وسجلات خدمة الفحص." : "في طابور الفحص";
}
export type FileScanSummary = {
  configured: boolean; configurationError?: string | null; busy: boolean; scanned: number;
  clean: number; pending: number; quarantined: number; skipped?: number;
  results?: Array<{ status: string; error: string | null }>;
};
export function fileScanSummaryMessage(summary: FileScanSummary) {
  if (!summary.configured) return { failed: true, message: fileScanErrorMessage(summary.configurationError || "scanner_not_configured") };
  if (summary.busy) return { failed: false, message: "عامل الفحص مشغول الآن. بقي الملف في الطابور؛ أعد المحاولة بعد انتهاء الفحص الجاري." };
  if (summary.pending) return { failed: true, message: "لم ينجح الفحص: " + fileScanErrorMessage(summary.results?.find(row => row.status === "pending")?.error) };
  if (summary.quarantined) return { failed: true, message: "حُجر الملف بعد الفحص ولن يتاح تنزيله. راجع سبب الحجر في الجدول." };
  if (summary.clean) return { failed: false, message: "نجح فحص " + summary.clean + " ملف وأصبح التنزيل متاحًا للمستخدم المخوّل." };
  return { failed: false, message: summary.skipped ? "تغير سجل الملف أثناء الفحص؛ حُدّثت القائمة دون اعتماد نتيجة قديمة." : "لا يوجد ملف معلق مطابق الآن؛ حُدّثت القائمة لعرض حالته الحالية." };
}
