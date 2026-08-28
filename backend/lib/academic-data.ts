export type ProgramArea = "تقنية" | "صحية" | "هندسية" | "إدارية" | "شرعية" | "علمية" | "إنسانية" | "تربوية" | "تصميم" | "تقنية تطبيقية";

export type AcademicProgram = {
  name: string;
  area: ProgramArea;
  degree: "بكالوريوس" | "دبلوم" | "دراسات عليا" | "مزدوج" | "فرعي";
  verificationStatus?: "official-program" | "discovery" | "pending-review";
  sourceUrl?: string;
  aliases?: string[];
};

const p = (name: string, area: ProgramArea, degree: AcademicProgram["degree"] = "بكالوريوس"): AcademicProgram => ({ name, area, degree });

const computing = [
  p("علوم الحاسب", "تقنية"), p("تقنية المعلومات", "تقنية"), p("نظم المعلومات", "تقنية"), p("هندسة البرمجيات", "تقنية"),
  p("الأمن السيبراني", "تقنية"), p("الذكاء الاصطناعي", "تقنية"), p("علم البيانات", "تقنية"), p("هندسة الحاسب", "تقنية"),
  p("الشبكات والاتصالات", "تقنية"), p("الحوسبة السحابية", "تقنية"), p("تطوير الويب والتطبيقات", "تقنية", "دبلوم"),
  p("تحليل البيانات", "تقنية"), p("المعلوماتية الصحية", "تقنية"), p("الوسائط الرقمية", "تقنية"),
];

const engineering = [
  p("الهندسة الكهربائية", "هندسية"), p("الهندسة الميكانيكية", "هندسية"), p("الهندسة المدنية", "هندسية"), p("الهندسة الصناعية", "هندسية"),
  p("الهندسة الكيميائية", "هندسية"), p("هندسة البترول", "هندسية"), p("هندسة الطيران", "هندسية"), p("هندسة التعدين", "هندسية"),
  p("الهندسة الطبية الحيوية", "هندسية"), p("هندسة الطاقة المتجددة", "هندسية"), p("هندسة الاتصالات", "هندسية"), p("هندسة الميكاترونكس", "هندسية"),
  p("العمارة", "هندسية"), p("التخطيط الحضري والإقليمي", "هندسية"), p("هندسة البناء", "هندسية"), p("هندسة المواد", "هندسية"),
  p("الهندسة البحرية", "هندسية"), p("السلامة والوقاية من الحريق", "هندسية"),
];

const health = [
  p("الطب والجراحة", "صحية"), p("طب الأسنان", "صحية"), p("دكتور صيدلة", "صحية"), p("الصيدلة الإكلينيكية", "صحية"),
  p("التمريض", "صحية"), p("القبالة", "صحية"), p("الصحة العامة", "صحية"), p("العلاج الطبيعي", "صحية"),
  p("العلاج التنفسي", "صحية"), p("الأشعة التشخيصية", "صحية"), p("المختبرات الطبية", "صحية"), p("التغذية الإكلينيكية", "صحية"),
  p("الخدمات الطبية الطارئة", "صحية"), p("البصريات", "صحية"), p("تقنية القلب", "صحية"), p("الإدارة الصحية", "صحية"),
  p("التخدير", "صحية"), p("تقنية الأسنان", "صحية"),
];

const business = [
  p("إدارة الأعمال", "إدارية"), p("المحاسبة", "إدارية"), p("المالية", "إدارية"), p("الاقتصاد", "إدارية"), p("التسويق", "إدارية"),
  p("نظم المعلومات الإدارية", "إدارية"), p("إدارة الموارد البشرية", "إدارية"), p("ريادة الأعمال", "إدارية"), p("سلاسل الإمداد", "إدارية"),
  p("إدارة المشاريع", "إدارية"), p("الأعمال المصرفية", "إدارية"), p("إدارة المخاطر والتأمين", "إدارية"), p("التجارة الإلكترونية", "إدارية"),
  p("الإدارة العامة", "إدارية"), p("السياحة والضيافة", "إدارية"), p("السياسات العامة", "إدارية", "دراسات عليا"),
];

const islamic = [
  p("الشريعة", "شرعية"), p("الأنظمة", "شرعية"), p("أصول الدين", "شرعية"), p("القرآن الكريم وعلومه", "شرعية"),
  p("السنة وعلومها", "شرعية"), p("الدعوة", "شرعية"), p("الفقه وأصوله", "شرعية"), p("الدراسات الإسلامية", "شرعية"),
];

const science = [
  p("الرياضيات", "علمية"), p("الإحصاء", "علمية"), p("الفيزياء", "علمية"), p("الكيمياء", "علمية"), p("الأحياء", "علمية"),
  p("الكيمياء الحيوية", "علمية"), p("الأحياء الدقيقة", "علمية"), p("علوم البيئة", "علمية"), p("الجيولوجيا", "علمية"),
  p("علوم البحار", "علمية"), p("التقنية الحيوية", "علمية"), p("علوم الأغذية", "علمية"),
];

const humanities = [
  p("اللغة العربية", "إنسانية"), p("اللغة الإنجليزية", "إنسانية"), p("الترجمة", "إنسانية"), p("التاريخ", "إنسانية"),
  p("الجغرافيا ونظم المعلومات الجغرافية", "إنسانية"), p("علم النفس", "إنسانية"), p("علم الاجتماع", "إنسانية"),
  p("الخدمة الاجتماعية", "إنسانية"), p("الإعلام", "إنسانية"), p("العلاقات العامة", "إنسانية"), p("الصحافة والإعلام الرقمي", "إنسانية"),
  p("المكتبات والمعلومات", "إنسانية"), p("الآثار", "إنسانية"), p("علوم الرياضة والنشاط البدني", "إنسانية"), p("القانون", "إنسانية"),
];

const education = [
  p("رياض الأطفال", "تربوية"), p("التربية الخاصة", "تربوية"), p("صعوبات التعلم", "تربوية"), p("المناهج وطرق التدريس", "تربوية"),
  p("أصول التربية", "تربوية"), p("التوجيه والإرشاد", "تربوية"), p("تقنيات التعليم", "تربوية"), p("الإدارة والتخطيط التربوي", "تربوية"),
];

const design = [
  p("التصميم الجرافيكي", "تصميم"), p("التصميم الداخلي", "تصميم"), p("تصميم الأزياء", "تصميم"), p("الفنون البصرية", "تصميم"),
  p("الإعلان والاتصال التسويقي", "تصميم"), p("تصميم المنتجات", "تصميم"),
];

const technical = [
  p("تقنية البرمجة وتطوير الويب", "تقنية تطبيقية", "دبلوم"), p("تقنية الشبكات", "تقنية تطبيقية", "دبلوم"),
  p("تقنية الأمن السيبراني", "تقنية تطبيقية", "دبلوم"), p("القوى الكهربائية", "تقنية تطبيقية", "دبلوم"),
  p("الإلكترونيات وأنظمة التحكم", "تقنية تطبيقية", "دبلوم"), p("التبريد والتكييف", "تقنية تطبيقية", "دبلوم"),
  p("المحركات والمركبات", "تقنية تطبيقية", "دبلوم"), p("تقنية التصنيع", "تقنية تطبيقية", "دبلوم"),
  p("المساحة", "تقنية تطبيقية", "دبلوم"), p("السلامة والصحة المهنية", "تقنية تطبيقية", "دبلوم"),
  p("تقنية الأجهزة الطبية", "تقنية تطبيقية", "دبلوم"), p("المحاسبة التطبيقية", "تقنية تطبيقية", "دبلوم"),
  p("الإدارة المكتبية", "تقنية تطبيقية", "دبلوم"), p("التسويق والابتكار", "تقنية تطبيقية", "دبلوم"),
];

const seuOfficialPrograms: AcademicProgram[] = [
  p("برنامج البكالوريوس في تقنية المعلومات", "تقنية"),
  p("برنامج البكالوريوس في علوم الحاسب الآلي", "تقنية"),
  p("برنامج البكالوريوس في علوم البيانات", "تقنية"),
  p("برنامج الماجستير في الأمن السيبراني", "تقنية", "دراسات عليا"),
  p("برنامج الماجستير في علوم البيانات", "تقنية", "دراسات عليا"),
  { ...p("برنامج بكالوريوس العلوم في إدارة الأعمال - تخصص إدارة", "إدارية"), aliases: ["إدارة الأعمال"] },
  p("برنامج الماجستير في إدارة الأعمال", "إدارية", "دراسات عليا"),
  p("برنامج ماجستير إدارة الأعمال التنفيذي", "إدارية", "دراسات عليا"),
  p("برنامج ماجستير تسويق رقمي", "إدارية", "دراسات عليا"),
  p("برنامج بكالوريوس العلوم في إدارة الأعمال - تخصص محاسبة", "إدارية"),
  p("برنامج بكالوريوس العلوم في المالية", "إدارية"),
  p("برنامج بكالوريوس العلوم في إدارة الأعمال - تخصص تجارة إلكترونية", "إدارية"),
  p("التخصص المزدوج - إدارة الأعمال", "إدارية", "مزدوج"),
  p("التخصص الفرعي - إدارة الأعمال", "إدارية", "فرعي"),
  p("التخصص المزدوج - المالية", "إدارية", "مزدوج"),
  p("التخصص الفرعي - المالية", "إدارية", "فرعي"),
  p("برنامج البكالوريس في المعلوماتية الصحية", "صحية"),
  p("برنامج البكالوريوس في الصحة العامة", "صحية"),
  p("برنامج الماجستير في إدارة الرعاية الصحية", "صحية", "دراسات عليا"),
  p("الماجستير التنفيذي لجودة الرعاية الصحية وسلامة المرضى", "صحية", "دراسات عليا"),
  p("برنامج البكالوريوس في الإعلام الإلكتروني", "إنسانية"),
  p("برنامج البكالوريوس في القانون", "إنسانية"),
  p("برنامج البكالوريوس في اللغة الإنجليزية والترجمة", "إنسانية"),
  p("برنامج الماجستير في تقنيات الترجمة", "إنسانية", "دراسات عليا"),
  p("برنامج البكالوريوس في الإحصاء التطبيقي وتحليل البيانات", "علمية"),
].map((program) => ({ ...program, verificationStatus: "official-program" as const, sourceUrl: "https://seu.edu.sa/ar/programs/" }));

const kaustPrograms = [
  p("علوم الحاسب", "تقنية", "دراسات عليا"), p("الهندسة الكهربائية وهندسة الحاسب", "هندسية", "دراسات عليا"),
  p("الإحصاء", "علمية", "دراسات عليا"), p("الرياضيات التطبيقية والعلوم الحاسوبية", "علمية", "دراسات عليا"),
  p("الهندسة الحيوية", "هندسية", "دراسات عليا"), p("العلوم البيولوجية", "علمية", "دراسات عليا"),
  p("علوم النبات", "علمية", "دراسات عليا"), p("علوم البحار", "علمية", "دراسات عليا"), p("العلوم البيئية والهندسة", "هندسية", "دراسات عليا"),
  p("الهندسة الكيميائية", "هندسية", "دراسات عليا"), p("الكيمياء", "علمية", "دراسات عليا"), p("علوم وهندسة الأرض", "هندسية", "دراسات عليا"),
  p("علوم وهندسة المواد والفيزياء التطبيقية", "هندسية", "دراسات عليا"), p("الهندسة الميكانيكية", "هندسية", "دراسات عليا"),
];

const unique = (rows: AcademicProgram[]) => Array.from(new Map(rows.map((row) => [row.name, row])).values());
const take = (rows: AcademicProgram[], count: number) => rows.slice(0, count);

const profiles: Record<string, AcademicProgram[]> = {
  comprehensive: unique([...take(computing, 9), ...take(engineering, 9), ...take(health, 14), ...take(business, 10), ...take(science, 10), ...take(humanities, 12), ...take(islamic, 6), ...take(education, 7), ...take(design, 4)]),
  regional: unique([...take(computing, 8), ...take(engineering, 7), ...take(health, 11), ...take(business, 8), ...take(science, 8), ...take(humanities, 9), ...take(islamic, 5), ...take(education, 5)]),
  islamic: unique([...islamic, ...take(humanities, 11), ...take(business, 8), ...take(computing, 5), ...take(science, 4), ...take(engineering, 4), ...take(education, 5)]),
  stem: unique([...take(computing, 11), ...take(engineering, 16), ...take(science, 10), ...take(business, 7), ...take(design, 2)]),
  women: unique([...take(computing, 9), ...take(engineering, 7), ...take(health, 15), ...take(business, 10), ...take(science, 10), ...take(humanities, 12), ...take(education, 8), ...design]),
  electronic: unique([...take(computing, 8), ...take(business, 11), health.find((row) => row.name === "الصحة العامة")!, computing.find((row) => row.name === "المعلوماتية الصحية")!, p("القانون", "إنسانية"), p("الإعلام الرقمي", "إنسانية"), p("اللغة الإنجليزية والترجمة", "إنسانية")]),
  health: health,
  computingBusiness: unique([...take(computing, 10), ...take(business, 12), ...take(engineering, 6), ...take(humanities, 4), ...take(design, 5)]),
  privateComprehensive: unique([...take(computing, 8), ...take(engineering, 7), ...take(health, 7), ...take(business, 11), ...take(humanities, 6), ...take(design, 5)]),
  business: unique([...business, p("القانون", "إنسانية")]),
  medicalCollege: take(health, 14),
  healthNursing: [health[4], health[5], health[6], health[7], health[8], health[9], health[10], health[11], health[12], health[15]],
  designBusiness: unique([...take(business, 10), ...design, ...take(computing, 5), p("القانون", "إنسانية")]),
  scienceCollege: unique([...take(computing, 8), ...take(science, 9), ...take(business, 5)]),
  technical,
  kaust: kaustPrograms,
};

const profileForInstitution: Record<string, keyof typeof profiles> = {
  "islamic-university": "islamic", imamu: "islamic", kfupm: "stem", pnu: "women", seu: "electronic", "ksau-hs": "health", kaust: "kaust",
  "umm-al-qura": "comprehensive", ksu: "comprehensive", kau: "comprehensive", kfu: "comprehensive", kku: "comprehensive", qu: "comprehensive", taibahu: "comprehensive", iau: "comprehensive",
  tu: "regional", uoh: "regional", jazanu: "regional", ju: "regional", bu: "regional", ut: "regional", nu: "regional", nbu: "regional", psau: "regional", su: "regional", mu: "regional", uj: "regional", ub: "regional", uhb: "regional",
  psu: "computingBusiness", alfaisal: "privateComprehensive", alyamamah: "computingBusiness", aou: "computingBusiness", effat: "designBusiness", dah: "designBusiness", ubt: "computingBusiness", pmu: "computingBusiness", fbsu: "privateComprehensive", "sr.edu": "privateComprehensive", almaarefa: "health", "riyadh-elm": "health", "dar-aluloom": "privateComprehensive", mustaqbal: "privateComprehensive", upm: "computingBusiness",
  aloola: "privateComprehensive", jadara: "business", "madinah-law": "islamic", "manar-aljanoub": "scienceCollege", "makkah-national": "privateComprehensive", alnahda: "health", kspp: "business", mbsc: "business",
  bmc: "medicalCollege", ibnsina: "medicalCollege", fakeeh: "medicalCollege", machs: "medicalCollege", vision: "medicalCollege", alghad: "healthNursing", inaya: "healthNursing", aic: "business", gulf: "business", jic: "designBusiness", "jubail-industrial": "technical", "yanbu-industrial": "technical", alasala: "privateComprehensive", "unaizah-colleges": "privateComprehensive", "ibn-rushd": "business", "baha-private": "scienceCollege", alriyada: "healthNursing", alrayan: "medicalCollege", "buraidah-colleges": "privateComprehensive", "saad-nursing": "healthNursing", "psc-management": "business", "north-nursing": "healthNursing", "vision-jeddah": "healthNursing", fayha: "healthNursing", almoosa: "healthNursing",
  "tvtc-riyadh": "technical", "tvtc-jeddah": "technical", "tvtc-madinah": "technical", "tvtc-dammam": "technical", "tvtc-abha": "technical", "tvtc-qassim": "technical", "tvtc-taif": "technical", "tvtc-tabuk": "technical",
};

const exactOverrides: Record<string, AcademicProgram[]> = {
  "ksau-hs": [{ ...p("الطب والجراحة", "صحية"), aliases: ["الطب"] }, p("طب الأسنان", "صحية"), p("دكتور صيدلة", "صحية"), p("التمريض", "صحية"), p("الصحة العامة", "صحية"), p("المعلوماتية الصحية", "تقنية"), p("العلاج التنفسي", "صحية"), p("الخدمات الطبية الطارئة", "صحية"), p("المختبرات الطبية", "صحية"), p("التغذية الإكلينيكية", "صحية"), p("العلاج الوظيفي", "صحية"), p("التخدير", "صحية")],
  "riyadh-elm": [p("طب الأسنان", "صحية"), p("صحة الفم والأسنان", "صحية"), p("مساعد طبيب أسنان", "صحية", "دبلوم"), p("تقنية الأسنان", "صحية"), p("التمريض", "صحية"), p("الصيدلة", "صحية")],
  mbsc: [p("ماجستير إدارة الأعمال", "إدارية", "دراسات عليا"), p("ماجستير المالية", "إدارية", "دراسات عليا"), p("ماجستير ريادة الأعمال", "إدارية", "دراسات عليا"), p("القيادة التنفيذية", "إدارية", "دراسات عليا")],
  kspp: [p("ماجستير السياسات العامة", "إدارية", "دراسات عليا"), p("اقتصاديات الطاقة", "إدارية", "دراسات عليا"), p("السياسات المناخية والاستدامة", "إدارية", "دراسات عليا")],
  "saad-nursing": [p("التمريض", "صحية"), p("تمريض الباطنة والجراحة", "صحية"), p("تمريض الأمومة والطفولة", "صحية"), p("تمريض صحة المجتمع", "صحية")],
  "north-nursing": [p("التمريض", "صحية"), p("تمريض الباطنة والجراحة", "صحية"), p("تمريض الأمومة والطفولة", "صحية"), p("تمريض صحة المجتمع", "صحية")],
};

export function getInstitutionPrograms(institutionSlug: string): AcademicProgram[] {
  if (institutionSlug === "seu") return seuOfficialPrograms;
  const programs = exactOverrides[institutionSlug] || profiles[profileForInstitution[institutionSlug] || "regional"];
  return programs.map((program) => ({ ...program, ...(institutionSlug === "kku" && program.name === "دكتور صيدلة" ? { aliases: ["الصيدلة"] } : {}), verificationStatus: "discovery" as const }));
}

const courseSets: Record<ProgramArea, string[]> = {
  تقنية: ["مقدمة في الحوسبة", "برمجة 1", "برمجة 2", "الرياضيات المتقطعة", "هياكل البيانات", "قواعد البيانات", "شبكات الحاسب", "نظم التشغيل", "هندسة البرمجيات", "أمن المعلومات", "مشروع التخرج"],
  صحية: ["المصطلحات الطبية", "التشريح", "وظائف الأعضاء", "الكيمياء الحيوية", "علم الأمراض", "الأحياء الدقيقة الطبية", "علم الأدوية", "المهارات السريرية", "أخلاقيات المهن الصحية", "البحث الصحي المبني على الدليل"],
  هندسية: ["التفاضل والتكامل", "الفيزياء العامة", "الرسم الهندسي", "الاستاتيكا", "الديناميكا", "خواص المواد", "البرمجة للمهندسين", "الاحتمالات والإحصاء الهندسي", "الاقتصاد الهندسي", "تصميم الأنظمة", "مشروع التخرج"],
  إدارية: ["مبادئ الإدارة", "مبادئ المحاسبة", "الاقتصاد الجزئي", "الإحصاء للأعمال", "مبادئ المالية", "مبادئ التسويق", "نظم المعلومات الإدارية", "السلوك التنظيمي", "إدارة العمليات", "ريادة الأعمال", "مشروع التخرج"],
  شرعية: ["مدخل إلى الشريعة", "علوم القرآن", "علوم الحديث", "العقيدة", "الفقه", "أصول الفقه", "القواعد الفقهية", "مقاصد الشريعة", "البحث الشرعي", "فقه النوازل"],
  علمية: ["التفاضل والتكامل", "الإحصاء والاحتمالات", "الفيزياء العامة", "الكيمياء العامة", "الأحياء العامة", "طرق البحث العلمي", "البرمجة العلمية", "التحليل العددي", "مختبر التخصص", "مشروع البحث"],
  إنسانية: ["مدخل إلى التخصص", "مهارات البحث والكتابة", "التفكير النقدي", "مناهج البحث", "الاتصال الأكاديمي", "نظريات التخصص", "تطبيقات مهنية", "التحليل النصي والكيفي", "أخلاقيات المهنة", "مشروع التخرج"],
  تربوية: ["مدخل إلى التربية", "علم النفس التربوي", "المناهج وطرق التدريس", "تقنيات التعليم", "القياس والتقويم", "إدارة الصف", "التربية الميدانية", "البحث التربوي", "تصميم الخبرات التعليمية", "مشروع التخرج"],
  تصميم: ["أسس التصميم", "الرسم والتكوين", "نظرية اللون", "التصميم الرقمي", "تاريخ الفن والتصميم", "الطباعة والإخراج", "تصميم تجربة المستخدم", "ملف الأعمال", "التدريب المهني", "مشروع التخرج"],
  "تقنية تطبيقية": ["أساسيات التقنية", "السلامة المهنية", "الرسم والقياسات الفنية", "المهارات الرقمية", "تطبيقات الورش", "تشخيص الأعطال", "الصيانة الوقائية", "الجودة الفنية", "التدريب التعاوني", "المشروع التطبيقي"],
};

const targetedCourses: Record<string, string[]> = {
  "الأمن السيبراني": ["أساسيات الأمن السيبراني", "أمن الشبكات", "التشفير", "الاختراق الأخلاقي", "التحليل الجنائي الرقمي", "أمن تطبيقات الويب", "إدارة المخاطر السيبرانية", "الاستجابة للحوادث", "الحوكمة والالتزام", "مشروع الأمن السيبراني"],
  "علوم الحاسب": ["برمجة 1", "برمجة كائنية التوجه", "الرياضيات المتقطعة", "هياكل البيانات", "تحليل الخوارزميات", "قواعد البيانات", "نظم التشغيل", "شبكات الحاسب", "الذكاء الاصطناعي", "مشروع التخرج"],
  "الطب والجراحة": ["التشريح", "وظائف الأعضاء", "الكيمياء الحيوية", "الأحياء الدقيقة", "علم الأمراض", "علم الأدوية", "الطب الباطني", "الجراحة العامة", "طب الأطفال", "النساء والولادة", "طب الأسرة", "المهارات السريرية"],
  "التمريض": ["أسس التمريض", "التقييم الصحي", "علم الأدوية للتمريض", "تمريض الباطنة والجراحة", "تمريض الأمومة والطفولة", "تمريض الصحة النفسية", "تمريض صحة المجتمع", "العناية الحرجة", "إدارة التمريض", "التدريب السريري"],
  "إدارة الأعمال": ["مبادئ الإدارة", "مبادئ المحاسبة", "الاقتصاد", "إدارة الموارد البشرية", "التسويق", "الإدارة المالية", "إدارة العمليات", "السلوك التنظيمي", "الإدارة الاستراتيجية", "ريادة الأعمال"],
};

export function getProgramCourses(program: AcademicProgram | string): string[] {
  const row = typeof program === "string" ? allPrograms.find((item) => item.name === program) : program;
  if (!row) return courseSets.إنسانية;
  return targetedCourses[row.name] || courseSets[row.area];
}

export const allPrograms = unique(Object.values(profiles).flat().concat(Object.values(exactOverrides).flat())).sort((a, b) => a.name.localeCompare(b.name, "ar"));

const normalizeProgramName = (value: string) => value.normalize("NFKC").replace(/ـ/g, "").replace(/\s+/g, " ").trim();

/** Returns the official name and every known alias as one equivalence set. */
export function specialtyNameVariants(institutionSlug: string, value: string) {
  const variants = new Set([normalizeProgramName(value)]);
  const programs = [...getInstitutionPrograms(institutionSlug), ...allPrograms];
  // Two passes close aliases that are declared only by one institution (for
  // example الطب ↔ الطب والجراحة and الصيدلة ↔ دكتور صيدلة).
  for (let pass = 0; pass < 2; pass += 1) {
    for (const program of programs) {
      const names = [program.name, ...(program.aliases || [])].map(normalizeProgramName);
      if (names.some((name) => variants.has(name))) names.forEach((name) => variants.add(name));
    }
  }
  variants.delete("");
  return variants;
}

export function specialtiesEquivalent(leftInstitutionSlug: string, left: string, rightInstitutionSlug: string, right: string) {
  const leftNames = specialtyNameVariants(leftInstitutionSlug, left);
  const rightNames = specialtyNameVariants(rightInstitutionSlug, right);
  return [...leftNames].some((name) => rightNames.has(name));
}

export const moeInstitutionDetails: Record<string, number> = {
  "islamic-university": 1, "umm-al-qura": 3, iau: 4, imamu: 5, psau: 6, pnu: 7, bu: 8, ju: 9, nbu: 10,
  tu: 11, qu: 12, mu: 13, kku: 14, ksu: 15, kau: 17, kfu: 19, ub: 20, ut: 21, jazanu: 22, uj: 23,
  uoh: 24, uhb: 25, su: 26, taibahu: 27, nu: 28,
};

export function getOfficialProgramSource(institutionSlug: string, domain?: string) {
  if (institutionSlug === "seu") return "https://seu.edu.sa/ar/programs/";
  const detailId = moeInstitutionDetails[institutionSlug];
  return detailId ? `https://studyinsaudi.moe.gov.sa/Universities/Details/${detailId}` : domain ? `https://${domain}` : "https://studyinsaudi.moe.gov.sa/Universities";
}
