export type ComplianceItem = {
  key: string;
  area: string;
  title: string;
  description: string;
  evidenceHint: string;
};

// Operational checklist aligned to the current public NELC e-learning quality
// themes. It is a management aid, not a claim of certification or licensing.
export const complianceCatalog: ComplianceItem[] = [
  { key: "governance", area: "القيادة والحوكمة", title: "هيكل الحوكمة والمسؤوليات", description: "تحديد مالك كل عملية وصلاحيات القرار والتصعيد والمراجعة الدورية.", evidenceHint: "قرار اعتماد، مصفوفة صلاحيات، محاضر مراجعة" },
  { key: "privacy", area: "السياسات", title: "الخصوصية وحماية البيانات", description: "توثيق الجمع والاستخدام والاحتفاظ والحذف وحقوق أصحاب البيانات.", evidenceHint: "سياسة منشورة، سجل معالجة، اختبارات حذف الحساب" },
  { key: "digital_security", area: "السياسات", title: "الأمان الرقمي", description: "ضوابط الهوية والصلاحيات والاستجابة للحوادث والنسخ الاحتياطي.", evidenceHint: "MFA، سجل الحوادث، نتائج الاستعادة، مراجعة أمنية" },
  { key: "academic_integrity", area: "السياسات", title: "النزاهة الأكاديمية", description: "تحديد السلوك المقبول وآلية البلاغ والمعالجة والتظلم.", evidenceHint: "سياسة منشورة، سجل حالات، مسار تظلم" },
  { key: "participation", area: "التعلّم", title: "الحضور والمشاركة", description: "تعريف المشاركة المطلوبة وكيفية رصد الانقطاع والأعذار التقنية.", evidenceHint: "تقارير تقدم، آلية تنبيه، سياسة أعذار" },
  { key: "content_rights", area: "المحتوى", title: "حقوق الملكية الفكرية", description: "توثيق ملكية المحتوى وتراخيص المواد المرفوعة وآلية إزالة المخالفات.", evidenceHint: "عقود المحتوى، سجل الموافقات، طلبات الإزالة" },
  { key: "communication_sla", area: "الدعم", title: "قنوات التواصل وأوقات الاستجابة", description: "نشر القنوات وساعات العمل وأهداف الاستجابة والتصعيد.", evidenceHint: "SLA، تقارير الدعم، سجل التصعيد" },
  { key: "ai_governance", area: "الذكاء الاصطناعي", title: "حوكمة استخدام الذكاء الاصطناعي", description: "بيان الاستخدامات المسموحة وحدود الإجابات والمراجعة البشرية والخصوصية.", evidenceHint: "سياسة AI، سجل تغييرات، اختبارات جودة" },
  { key: "content_quality", area: "الجودة", title: "مراجعة جودة المحتوى", description: "دورة اعتماد وتحديث وتصحيح للمادة مع مالك واضح وتاريخ مراجعة.", evidenceHint: "قائمة فحص نشر، سجل إصدارات، نتائج مراجعة" },
  { key: "service_continuity", area: "الاستدامة", title: "استمرارية الخدمة والتعافي", description: "أهداف الاستعادة ونسخ احتياطي مجرّب وخطة تواصل عند الانقطاع.", evidenceHint: "RPO/RTO، تقرير استعادة، خطة حادث" },
  { key: "performance_kpis", area: "القياس", title: "مؤشرات الأداء والتحسين", description: "قياس التعلم والتحويل والاحتفاظ وجودة الدعم واتخاذ إجراءات موثقة.", evidenceHint: "لوحة مؤشرات، محاضر قرارات، مقارنة دورية" },
  { key: "vendor_management", area: "الموردون", title: "إدارة مزودي الخدمة", description: "تقييم Tap والتخزين والإشعارات والبريد واتفاقيات مستوى الخدمة والمخاطر.", evidenceHint: "سجل موردين، SLA، تقييم مخاطر، خطة بديل" },
];

export const complianceStatuses = ["not_started", "in_progress", "ready", "verified"] as const;
