/** Client-safe labels only. This module never imports a database, token or scanner. */
export const fileScanKindLabels: Record<string, string> = { request: "مرفقات طلبات المواد", support: "مرفقات الدعم", resource: "ملفات المواد التعليمية", ai: "ملفات أدوات مراس" };
export function fileScanErrorLabel(code?: string | null) {
  if (!code) return "بانتظار دور الفحص";
  if (/^scanner_http_(401|403)$/.test(code)) return "خدمة الفحص رفضت الاعتماد؛ راجع مفتاح الخدمة";
  if (/^scanner_http_/.test(code)) return "خدمة الفحص أعادت خطأ؛ راجع اتصال الخدمة وحصتها";
  const labels: Record<string, string> = {
    scanner_busy: "المحرك مشغول؛ ستعاد المحاولة تلقائيًا",
    scanner_not_configured: "محرك الفحص غير مهيأ", scanner_invalid_configuration: "إعداد محرك الفحص غير صالح",
    stored_object_missing: "الملف مفقود من التخزين المحدد — يلزم استعادته أو إعادة رفعه",
    scanner_connection_failed: "تعذر الاتصال بمحرك الفحص", scanner_timeout: "انتهت مهلة الفحص؛ ستعاد المحاولة",
    scanner_size_limit: "الحجم يتجاوز حد الفحص أو حد فك الضغط", scanner_invalid_response: "استجابة محرك الفحص غير صالحة",
    scanner_indeterminate: "لم يصدر المحرك نتيجة سلامة مؤكدة", stored_object_empty: "الملف المخزن فارغ",
    real_scanner_required: "الفحص السابق لم يكن فحصًا فعليًا للبرمجيات الضارة",
  };
  return labels[code] || "تعذر إتمام الفحص؛ ستعاد المحاولة دون تجاوز الحماية";
}
