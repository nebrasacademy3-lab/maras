import { allPrograms, getInstitutionPrograms, getProgramCourses } from "@/lib/academic-data";
import { courses, institutions } from "@/lib/data";
import type { SessionUser } from "@/lib/auth";
import { PUBLIC_SETTING_DEFAULTS, type PublicSettings, whatsappHref } from "@/lib/platform-settings";

export type AssistantAction = { label: string; href: string };
export type AssistantReply = { answer: string; actions: AssistantAction[]; suggestions?: string[] };

const normalize = (value: string) => value.toLowerCase()
  .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/[ًٌٍَُِّْـ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const tokens = (value: string) => normalize(value).split(" ").filter((word) => word.length > 1);
const bigrams = (value: string) => Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2));
const closeWord = (left: string, right: string) => {
  if (left === right || left.includes(right) || right.includes(left)) return true;
  if (Math.min(left.length, right.length) < 4) return false;
  const a = bigrams(left); const b = bigrams(right); let overlap = 0; const copy = [...b];
  for (const item of a) { const index = copy.indexOf(item); if (index >= 0) { overlap += 1; copy.splice(index, 1); } }
  return (2 * overlap) / Math.max(1, a.length + b.length) >= 0.67;
};
const has = (text: string, terms: string[]) => {
  const haystack = tokens(text);
  return terms.some((term) => {
    const normalized = normalize(term);
    if (text.includes(normalized)) return true;
    const wanted = tokens(normalized);
    return wanted.length > 0 && wanted.every((word) => haystack.some((candidate) => closeWord(candidate, word)));
  });
};
const action = (label: string, href: string): AssistantAction => ({ label, href });

function detectedInstitution(text: string) {
  return [...institutions].sort((a, b) => b.name.length - a.name.length).find((item) => {
    const full = normalize(item.name);
    const short = full.replace(/^(جامعه|الجامعه|كليه|كليات)\s+/, "");
    return text.includes(full) || (short.length > 5 && text.includes(short));
  });
}

function detectedProgram(text: string) {
  return [...allPrograms].sort((a, b) => b.name.length - a.name.length).find((item) => text.includes(normalize(item.name)));
}

export function answerAssistant(rawQuestion: string, user: SessionUser | null, publicSettings: PublicSettings = { ...PUBLIC_SETTING_DEFAULTS }): AssistantReply {
  const text = normalize(rawQuestion);
  const institution = detectedInstitution(text);
  const program = detectedProgram(text);
  const matchedCourse = courses.find((course) => text.includes(normalize(course.title)) || (course.code && text.includes(normalize(course.code))));
  const firstName = user?.fullName?.split(" ")[0];

  if (has(text, ["السلام", "مرحبا", "هلا", "اهلا", "صباح الخير", "مساء الخير"])) return {
    answer: `${firstName ? `أهلًا ${firstName}،` : "أهلًا بك،"} أنا مساعد مراس الذكي. أقدر أرشدك للتسجيل والجامعات والتخصصات والمواد والشراء والمشغل وطلبات المواد والدعم. اكتب سؤالك بطريقتك.`,
    actions: user ? [action("فتح لوحتي", "/dashboard")] : [action("إنشاء حساب", "/register")],
    suggestions: ["ما لقيت مادتي", "كيف أجرب درسًا؟", "كيف أحمي حسابي؟"],
  };

  if (has(text, ["ما لقيت", "لم اجد", "غير موجود", "مو موجود", "طلب ماده", "اطلب ماده", "توفير ماده", "اضافه ماده", "السلايدات"])) return {
    answer: "إذا لم تجد مادتك، افتح «طلب مادة»، واكتب اسمها ورمزها إن وجد ثم ارفع السلايدات أو توصيف المقرر (PDF أو PPTX أو DOCX أو صور). يصل الطلب للمشرف مرتبطًا بجامعتك وتخصصك، ويمكنك متابعة حالته والإشعارات من لوحة الطالب.",
    actions: [action("طلب مادة الآن", "/request-course"), action("متابعة طلباتي", "/dashboard?view=requests")],
    suggestions: ["ما الملفات المسموحة؟", "كيف أتابع الطلب؟"],
  };

  if (has(text, ["انشاء حساب", "حساب جديد", "اسجل", "التسجيل", "اشتراك حساب"])) return {
    answer: "إنشاء الحساب يتم في 3 خطوات: بياناتك الأساسية، ثم اختيار الجامعة والتخصص الخاص بها، ثم مراجعة البيانات والموافقة على الشروط. بعد الإنشاء تبدأ جولة إرشادية. يلزم حساب مكتمل قبل الشراء أو إرسال طلب مادة.",
    actions: [action("إنشاء حساب", "/register"), action("لدي حساب", "/login")],
  };

  if (has(text, ["تسجيل الدخول", "ما يدخل", "ما اقدر ادخل", "دخول حسابي", "بيانات الدخول"])) return {
    answer: "يمكنك الدخول بالبريد الإلكتروني أو رقم الجوال السعودي وكلمة المرور. تأكد من كتابة الجوال بصيغة 05xxxxxxxx أو +9665xxxxxxxx. بعد محاولات خاطئة متكررة تتوقف المحاولات مؤقتًا لحماية الحساب.",
    actions: [action("تسجيل الدخول", "/login"), action("نسيت كلمة المرور", "/forgot-password")],
  };

  if (has(text, ["نسيت كلمه المرور", "استعاده كلمه المرور", "تغيير كلمه المرور", "رمز الاستعاده"])) return {
    answer: "اختر «نسيت كلمة المرور»، وأدخل بريد الحساب. ستُنشأ عملية استعادة آمنة ومحدودة المدة، وبعد تعيين كلمة جديدة تُلغى الجلسات القديمة لحماية حسابك.",
    actions: [action("استعادة كلمة المرور", "/forgot-password")],
  };

  if (institution) {
    const programs = getInstitutionPrograms(institution.slug);
    const names = programs.slice(0, 14).map((item) => item.name).join("، ");
    return {
      answer: `${institution.name} مدرجة في مراس ضمن ${institution.type === "حكومية" ? "الجامعات الحكومية" : institution.type === "أهلية" ? "الجامعات الأهلية" : "الكليات"} في ${institution.region}. من برامجها المدرجة: ${names}${programs.length > 14 ? `، وغيرها (${programs.length} برنامجًا في الدليل)` : ""}. افتح صفحتها للبحث في جميع البرامج ورؤية مواد كل تخصص ورابط المصدر الرسمي.`,
      actions: [action(`صفحة ${institution.name}`, `/universities/${institution.slug}`), action("طلب مادة لهذه الجهة", "/request-course")],
      suggestions: ["كيف أختار تخصصي؟", "ما المواد المتاحة؟"],
    };
  }

  if (program) {
    const names = getProgramCourses(program);
    return {
      answer: `مواد ${program.name} المقترحة في الدليل تشمل: ${names.join("، ")}. قد تختلف رموز المادة والخطة حسب الجامعة والسنة؛ افتح جامعتك لمطابقة برنامجها، أو أرسل توصيف المقرر إذا كانت المادة غير متاحة.`,
      actions: [action("البحث عن المواد", `/courses?q=${encodeURIComponent(program.name)}`), action("طلب مادة", "/request-course")],
    };
  }

  if (matchedCourse) return {
    answer: `${matchedCourse.title} متاحة لطلاب ${matchedCourse.university} ضمن ${matchedCourse.specialty}. تحتوي ${matchedCourse.lessons} درسًا لمدة ${matchedCourse.duration}، وسعرها ${matchedCourse.price} ر.س، ويمكنك مشاهدة الدرس المجاني قبل الشراء.`,
    actions: [action("فتح صفحة المادة", `/courses/${matchedCourse.slug}`), action("مشاهدة الدرس المجاني", `/courses/${matchedCourse.slug}#preview`)],
  };

  if (has(text, ["الجامعات", "الكليات", "جامعه", "كليه", "كم جامعه"])) return {
    answer: `يضم دليل مراس ${institutions.length} جامعة وكلية وجهة تقنية سعودية، مع البحث حسب الاسم والمنطقة والنوع. صفحة كل جهة تعرض تخصصاتها وموادها ومصدرها الرسمي.`,
    actions: [action("استعراض الجامعات والكليات", "/universities")],
    suggestions: ["جامعة الملك سعود", "جامعة أم القرى", "الكليات الصحية"],
  };

  if (has(text, ["جامعه ثانيه", "غير جامعتي", "باقي الجامعات", "تخصص ثاني", "اقدر اشترك من جامعه ثانيه", "مواد خارج تخصصي", "اتصفح الكل"])) return {
    answer: "نعم. تظهر لك توصيات جامعتك وتخصصك أولًا داخل لوحة الطالب، لكن فهرس مراس مفتوح لتصفح جميع الجامعات والتخصصات والمواد. يمكنك شراء أي مادة منشورة تناسبك حتى لو كانت مرتبطة بجهة أو تخصص آخر، وتبقى في «موادي» بعد تأكيد الدفع.",
    actions: [action("تصفح كل المواد", "/courses"), action("تصفح كل الجامعات", "/universities"), action("موادي", "/dashboard?view=courses")],
  };

  if (has(text, ["اشتري", "شراء", "ادفع", "الدفع", "تاب", "بطاقه", "مدى", "فيزا", "السعر"])) return {
    answer: "يلزم تسجيل الدخول وملف مكتمل قبل الشراء. اختر المادة وشاهد الدرس المجاني ثم تابع الدفع الآمن عبر Tap. لا تتفعّل المادة بمجرد الرجوع من صفحة الدفع؛ التفعيل يتم فقط بعد تأكيد العملية من الخادم، ثم تظهر في «موادي» وتصدر الفاتورة.",
    actions: [action("تصفح المواد", "/courses"), action("الطلبات والفواتير", "/dashboard?view=orders")],
  };

  if (has(text, ["تحميل الفيديو", "تنزيل الفيديو", "احمل الدرس", "download", "سرقه الفيديو", "حمايه الفيديو"])) return {
    answer: "فيديوهات الدروس غير قابلة للتنزيل من واجهة المنصة. تُعرض داخل مشغل مراس بجلسة مشاهدة وروابط بث مؤقتة وعلامة مائية، ولا يظهر زر تنزيل. تقنيًا لا يمكن لأي موقع ضمان منع النسخ 100% على جهاز يملكه المستخدم، لذلك نجمع تقليل الوصول المباشر مع التتبع وسياسة الاستخدام.",
    actions: [action("استكشف الدروس", "/courses"), action("سياسة الاستخدام", "/terms")],
  };

  if (has(text, ["المشغل", "سرعه الفيديو", "الجوده", "ملء الشاشه", "ترجمه", "اختصارات", "اكمل الفيديو", "التقدم"])) return {
    answer: "مشغل مراس يدعم التشغيل والإيقاف، شريط التقدم، استكمال آخر ثانية، السرعات، مستوى الصوت، الجودة، ملء الشاشة، اختصارات لوحة المفاتيح، والتنقل بين الدروس. التقدم يُحفظ تلقائيًا للحساب على الأجهزة المختلفة.",
    actions: [action("فتح موادي", "/dashboard?view=courses")],
  };

  if (has(text, ["درس مجاني", "تجربه", "اجرب الشرح", "قبل الاشتراك"])) return {
    answer: "نعم. افتح أي مادة عليها شارة «درس مجاني» وشاهد المعاينة داخل مشغل مراس قبل الدفع، حتى تتأكد أن أسلوب الشرح مناسب لك.",
    actions: [action("تصفح الدروس التجريبية", "/courses")],
  };

  if (has(text, ["تخصصي", "تغيير الجامعه", "تغيير التخصص", "اكمل بياناتي", "رقم الجوال", "ملفي"])) return {
    answer: "من «حسابي» يمكنك تحديث الاسم والجوال والجامعة، وبعد اختيار الجامعة تُحمّل تخصصاتها المرتبطة فقط. يجب أن يبقى الاسم والجوال والجامعة والتخصص مكتملًا حتى تعمل المشتريات وطلبات المواد بشكل صحيح.",
    actions: [action("إعدادات الحساب", "/dashboard?view=account")],
  };

  if (has(text, ["الفاتوره", "فاتورتي", "طلباتي", "عمليه الشراء", "استرجاع", "استرداد"])) return {
    answer: "تظهر عمليات الدفع المؤكدة والفواتير في «الطلبات والفواتير». إذا كانت العملية معلقة أو تحتاج طلب استرداد، أرسل للدعم رقم الطلب ولا ترسل بيانات البطاقة أبدًا.",
    actions: [action("الطلبات والفواتير", "/dashboard?view=orders"), action("تواصل مع الدعم", "/support")],
  };

  if (has(text, ["خصم", "كوبون", "قسيمه", "كود خصم", "عرض"])) return {
    answer: "إذا كان لديك كوبون نشط، أدخله في صفحة إتمام الشراء. يتحقق الخادم من الصلاحية والمدة والحد وعدد الاستخدامات والمادة المشمولة، ثم يعيد حساب الإجمالي قبل إنشاء عملية Tap. لا تعتمد على سعر ظاهر خارج صفحة الدفع النهائية.",
    actions: [action("تصفح المواد", "/courses"), action("الطلبات والفواتير", "/dashboard?view=orders")],
  };

  if (has(text, ["تقييم", "قيم الماده", "اكتب رايي", "مراجعه", "نجوم"])) return {
    answer: "تستطيع تقييم مادة اشتريتها بعد بدء التعلم. يُرسل التقييم للمراجعة للتأكد من خلوه من الإساءة أو البيانات الشخصية، ثم يظهر للزوار عند نشره. التقييمات المنشورة من الطلاب الفعليين تتميز عن النصوص التعريفية للمنصة.",
    actions: [action("فتح موادي", "/dashboard?view=courses"), action("تصفح المواد", "/courses")],
  };

  if (has(text, ["الملفات", "ارفع", "مرفقات", "pdf", "ppt", "بوربوينت"])) return {
    answer: "في طلب المادة يمكنك رفع حتى 5 ملفات من PDF أو PPT/PPTX أو DOC/DOCX أو PNG/JPG، وبحد أقصى 15MB لكل ملف. ارفع التوصيف أو السلايدات التي يحق لك مشاركتها فقط.",
    actions: [action("رفع ملفات مع طلب مادة", "/request-course")],
  };

  if (has(text, ["الدعم", "مشكله", "شكوى", "تواصل", "ساعدني", "خطا", "ما يشتغل"])) {
    const whatsApp = whatsappHref(publicSettings);
    return {
      answer: `افتح تذكرة دعم واكتب وصف المشكلة واسم المادة ورقم الطلب إن وجد. لا تشارك كلمة المرور أو بيانات البطاقة. بريد الدعم: ${publicSettings.support_email}، وساعات العمل: ${publicSettings.support_hours}.${whatsApp ? " ويمكنك أيضًا بدء محادثة واتساب من الزر أدناه." : " لم تنشر الإدارة رقم واتساب بعد."}`,
      actions: [action("فتح تذكرة دعم", "/support"), ...(whatsApp ? [action("واتساب الدعم", whatsApp)] : []), action("صفحة التواصل", "/contact")],
    };
  }

  if (has(text, ["واتساب", "واتس", "انستقرام", "انستغرام", "تويتر", "اكس", "تيك توك", "يوتيوب", "تلجرام", "لينكد ان", "سوشال", "حسابات التواصل"])) {
    const actions = [
      whatsappHref(publicSettings) ? action("واتساب", whatsappHref(publicSettings)) : null,
      publicSettings.social_x ? action("X", publicSettings.social_x) : null,
      publicSettings.social_instagram ? action("Instagram", publicSettings.social_instagram) : null,
      publicSettings.social_tiktok ? action("TikTok", publicSettings.social_tiktok) : null,
      publicSettings.social_youtube ? action("YouTube", publicSettings.social_youtube) : null,
    ].filter((item): item is AssistantAction => Boolean(item));
    return { answer: actions.length ? "هذه قنوات مراس التي نشرتها الإدارة. للمشكلات المرتبطة بحساب أو دفع، التذكرة هي الأفضل لأنها تحفظ رقم المتابعة." : "لم تنشر الإدارة روابط واتساب أو شبكات اجتماعية بعد. يمكنك فتح تذكرة دعم الآن وسيصل طلبك إلى الفريق.", actions: [...actions.slice(0, 4), action("فتح تذكرة دعم", "/support")].slice(0, 4) };
  }

  if (has(text, ["اشعار", "التنبيهات", "وصلني", "حاله الطلب", "متابعه الطلب"])) return {
    answer: "تظهر إشعارات حسابك عند تحديث طلب مادة أو تأكيد شراء أو نشر تنبيه. افتح «الإشعارات» من لوحة الطالب، وتابع طلبات المواد من قسمها المخصص. الإشعارات لا تغيّر صلاحية المادة وحدها؛ صلاحية الشراء تعتمد على تأكيد الدفع في الخادم.",
    actions: [action("الإشعارات", "/dashboard?view=notifications"), action("طلبات المواد", "/dashboard?view=requests")],
  };

  if (has(text, ["سياسه الخصوصيه", "بياناتي", "حذف حساب", "الشروط", "حقوق المحتوى", "استعمال المنصه"])) return {
    answer: "يمكنك مراجعة الشروط والخصوصية وحقوق المحتوى من الصفحات القانونية. لطلب متعلق ببيانات الحساب أو حذفه افتح تذكرة دعم من البريد المسجل حتى يتم التحقق من الهوية قبل أي إجراء حساس.",
    actions: [action("الخصوصية", "/privacy"), action("الشروط", "/terms"), action("حقوق المحتوى", "/content-policy"), action("الدعم", "/support")],
  };

  if (has(text, ["الوضع الليلي", "الوضع الفاتح", "داكن", "فاتح", "الجوال", "الايباد", "متوافق", "الشاشه"])) return {
    answer: "المنصة متجاوبة للجوال واللوحي والكمبيوتر، وتدعم الوضعين الفاتح والليلي. استخدم زر الشمس/القمر في أعلى الصفحة، ويُحفظ اختيارك على هذا الجهاز.",
    actions: [action("الصفحة الرئيسية", "/")],
  };

  if (has(text, ["المشرف", "الاداره", "لوحه المشرف", "صلاحيات"])) {
    if (user?.role === "admin") return { answer: "حسابك إداري. من لوحة الإدارة تدير الجامعات والشعارات والتخصصات والمواد والوحدات والدروس والطلاب والصلاحيات والطلبات والدعم والتقييمات وروابط التواصل. جميع تعديلات الكتابة تتحقق من الدور والمصدر في الخادم وتسجل في سجل النشاط.", actions: [action("فتح لوحة الإدارة", "/admin"), action("لوحة الطالب", "/dashboard")] };
    if (user?.role === "supervisor") return { answer: "حسابك مشرف محتوى. افتح لوحة المشرف لمتابعة الطلبات المطابقة لنطاق جامعتك وتخصصك وتحديث حالتها ورفع فيديوهات الدروس المسندة. لا تمنحك الواجهة صلاحيات الإدارة العامة.", actions: [action("فتح لوحة المشرف", "/supervisor"), action("لوحة الطالب", "/dashboard")] };
    return { answer: "لوحات الإشراف والإدارة لا تظهر للطلاب في صفحة الدخول، ولا تُفتح إلا لحساب موظف مُنح الدور والصلاحية من الخادم. الطالب يتابع مواده وطلباته وفواتيره من لوحته فقط.", actions: [action("لوحة الطالب", "/dashboard")] };
  }

  return {
    answer: "أفهم أنك تحتاج مساعدة داخل مراس. أستطيع شرح التسجيل، اختيار الجامعة والتخصص، المواد، الدروس التجريبية، الدفع، المشغل، طلب مادة ورفع السلايدات، الفواتير، الحساب والدعم. اكتب اسم الجامعة أو المادة أو صف ما الذي حاولت فعله، وسأعطيك خطوات ورابطًا مباشرًا.",
    actions: [action("مركز المساعدة", "/support"), action("طلب مادة", "/request-course")],
    suggestions: ["كيف أسجل؟", "ما لقيت مادتي", "كيف أشاهد درسًا مجانيًا؟"],
  };
}
