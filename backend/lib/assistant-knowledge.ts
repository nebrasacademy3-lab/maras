import { allPrograms, getInstitutionPrograms, getProgramCourses } from "@/lib/academic-data";
import { courses as bundledCourses, institutions as bundledInstitutions, type Course, type Institution } from "@/lib/data";
import type { SessionUser } from "@/lib/auth";
import { PUBLIC_SETTING_DEFAULTS, type PublicSettings, whatsappHref } from "@/lib/platform-settings";

export type AssistantAction = { label: string; href: string };
export type AssistantReply = { answer: string; actions: AssistantAction[]; suggestions?: string[] };

const normalize = (value: string) => value.toLowerCase()
  .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
  .replace(/[پ]/g, "ب").replace(/[چ]/g, "ج").replace(/[گ]/g, "ك").replace(/[ڤ]/g, "ف")
  .replace(/[ًٌٍَُِّْـ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const tokens = (value: string) => normalize(value).split(" ").filter((word) => word.length > 1);
const bigrams = (value: string) => Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2));
const closeWord = (left: string, right: string) => {
  if (left === right) return true;
  if (Math.min(left.length, right.length) >= 3 && (left.includes(right) || right.includes(left))) return true;
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

type LiveAssistantCatalog = { institutions: Institution[]; courses: Course[] };
export type AssistantIntent = "greeting" | "registration" | "login" | "recovery" | "profile" | "security" | "university" | "specialty" | "course_search" | "course_request" | "files" | "cart_favorites" | "payment" | "coupon" | "learning" | "notifications" | "support" | "appearance" | "staff" | "assistant" | "thanks" | "general";

export function detectAssistantIntent(rawQuestion: string): AssistantIntent {
  const text = normalize(rawQuestion);
  const rules: Array<[AssistantIntent, string[]]> = [
    ["greeting", ["السلام عليكم", "مرحبا", "اهلا", "هلا", "صباح الخير", "مساء الخير"]],
    ["thanks", ["شكرا", "مشكور", "يعطيك العافيه", "ممتاز", "تمام"]],
    ["recovery", ["نسيت كلمه المرور", "استعاده الحساب", "استرجاع الحساب", "رمز التحقق", "ما اتذكر الباسورد", "تغيير كلمه المرور"]],
    ["security", ["امن", "امان", "اختراق", "تسلل", "سرقه الحساب", "حذف حساب", "خصوصيه", "بياناتي"]],
    ["registration", ["انشاء حساب", "حساب جديد", "سجلت جديد", "ابغى اسجل", "التسجيل", "اشتراك حساب"]],
    ["login", ["تسجيل الدخول", "ما يدخل", "ما اقدر ادخل", "خطا في الدخول", "مشكله الدخول", "دخول حسابي"]],
    ["profile", ["اكمل بياناتي", "المستوى الدراسي", "مستواي", "تغيير الجامعه", "تغيير التخصص", "ملفي", "بيانات الحساب"]],
    ["course_request", ["ما لقيت مادتي", "ماده غير موجوده", "اطلب ماده", "توفير ماده", "طلب مقرر", "السلايدات", "التوصيف"]],
    ["learning", ["درس مجاني", "المشغل", "الفيديو", "سرعه الفيديو", "اكمل الفيديو", "تقدم", "ملء الشاشه", "الجوده", "ما يشتغل الفيديو"]],
    ["files", ["رفع ملف", "ارفع ملف", "مرفق", "مرفقات", "pdf", "بوربوينت", "حجم الملف", "رفع فيديو"]],
    ["coupon", ["كوبون", "قسيمه", "رمز خصم", "كود خصم", "بروموكود", "خصم"]],
    ["payment", ["اشتري", "شراء", "ادفع", "الدفع", "بطاقه", "مدى", "فيزا", "ماستر", "فاتوره", "استرداد", "استرجاع مبلغ", "عملية الدفع"]],
    ["cart_favorites", ["السله", "أضيف للسلة", "المفضله", "المفضلة", "القلب", "حفظ ماده"]],
    ["notifications", ["اشعار", "اشعارات", "تنبيه", "التنبيهات", "وصلني اشعار", "حاله الطلب"]],
    ["support", ["الدعم", "مشكله", "مشكلة", "شكوى", "ساعدني", "ما يشتغل", "ما يفتح", "خربان", "تواصل"]],
    ["appearance", ["الوضع الليلي", "الوضع الفاتح", "الثيم", "حجم الخط", "تكبير الخط", "تصغير الخط", "المظهر", "الشاشه"]],
    ["staff", ["المشرف", "الاداره", "لوحه المشرف", "صلاحيات", "رفع فيديو للمادة"]],
    ["assistant", ["المساعد", "الذكاء الاصطناعي", "اسال المساعد", "كيف اسال"]],
    ["university", ["الجامعات", "الكليات", "جامعه", "كليه", "جهة تعليمية", "جامعة ثانيه", "غير جامعتي"]],
    ["specialty", ["التخصص", "تخصصات", "تخصصي", "برنامج دراسي", "خطة دراسية"]],
    ["course_search", ["المواد", "ماده", "مقرر", "ابحث عن مادة", "فلتر المواد", "كل المواد"]],
  ];
  return rules.find(([, terms]) => has(text, terms))?.[0] || "general";
}

function intentFallback(intent: AssistantIntent, user: SessionUser | null, settings: PublicSettings, institutions: Institution[], courses: Course[]): AssistantReply | null {
  const whatsApp = whatsappHref(settings);
  const firstName = user?.fullName?.split(" ")[0];
  const reply = (answer: string, actions: AssistantAction[], suggestions: string[] = []) => ({ answer, actions, suggestions });
  switch (intent) {
    case "registration": return reply("لإنشاء حساب جديد: 1) افتح صفحة التسجيل. 2) أدخل الاسم والبريد والجوال وكلمة مرور قوية. 3) اختر الجامعة أو الكلية، ثم اختر تخصصًا تابعًا لها. 4) حدّد مستواك الدراسي ووافق على الشروط. بعد النجاح سجّل الدخول أو أكمل الجولة التعريفية. لا تستخدم بريدًا أو رقمًا مرتبطًا بحساب سابق، ولا تشارك كلمة المرور مع أي شخص.", [action("إنشاء حساب", "/register"), action("لدي حساب", "/login")], ["ما شروط كلمة المرور؟", "لماذا لا يقبل التسجيل؟"]);
    case "login": return reply("لتسجيل الدخول: استخدم البريد الإلكتروني أو الجوال السعودي المرتبط بالحساب، ثم أدخل كلمة المرور كما هي. اكتب الجوال بصيغة 05xxxxxxxx أو +9665xxxxxxxx، وتأكد من عدم وجود مسافات زائدة. إذا ظهرت رسالة خطأ، لا تكرر المحاولات بسرعة؛ استخدم استعادة كلمة المرور، ثم أعد فتح الصفحة بعد نجاح الاستعادة. لا ترسل كلمة المرور للدعم.", [action("تسجيل الدخول", "/login"), action("نسيت كلمة المرور", "/forgot-password")], ["نسيت كلمة المرور", "يظهر خطأ في الطلب"]);
    case "recovery": return reply("لاستعادة الحساب: 1) افتح «نسيت كلمة المرور». 2) أدخل البريد المستخدم في التسجيل. 3) افتح رسالة الاستعادة واتبع الرابط قبل انتهاء مدته. 4) عيّن كلمة مرور جديدة قوية. بعد التغيير تُلغى الجلسات القديمة لحماية الحساب. إذا لم تصل الرسالة، افحص الرسائل غير المرغوبة وتأكد من البريد، ثم افتح تذكرة دون إرسال الرمز نفسه.", [action("استعادة كلمة المرور", "/forgot-password"), action("الدعم", "/support")], ["لم تصلني الرسالة", "أريد تغيير كلمة المرور"]);
    case "course_request": return reply("إذا لم تجد المادة: 1) افتح «طلب مادة». 2) اكتب الاسم والرمز إن وجد. 3) أضف ملاحظات عن المطلوب. 4) ارفع السلايدات أو توصيف المقرر المسموح بمشاركته. 5) أرسل الطلب وتابع حالته من لوحة الطالب. يُربط الطلب بجامعتك وتخصصك ليصل إلى المشرف الصحيح، وعند تجهيز المحتوى يصلك إشعار ورابط المادة.", [action("طلب مادة الآن", "/request-course"), action("متابعة الطلبات", "/dashboard?view=requests")], ["ما الملفات المقبولة؟", "كم يستغرق الطلب؟"]);
    case "payment": return reply("لشراء مادة: 1) سجّل الدخول وأكمل ملفك الجامعي. 2) افتح المادة وراجع السعر والوصف والدرس المجاني. 3) أضفها إلى السلة، وراجع المواد والإجمالي. 4) أدخل كوبونًا نشطًا إن وجد. 5) تابع الدفع عبر Tap. لا تعتبر المادة مفعّلة بمجرد العودة من صفحة الدفع؛ الخادم يؤكد العملية أولًا، ثم تظهر المادة في «موادي» وتصدر الفاتورة. عند مشكلة، أرسل رقم الطلب فقط ولا ترسل بيانات البطاقة.", [action("استكشاف المواد", "/courses"), action("السلة", "/cart"), action("الطلبات والفواتير", "/dashboard?view=orders")], ["لم تتفعل المادة", "أريد استرداد المبلغ"]);
    case "coupon": return reply("لاستخدام كوبون: أضف المادة إلى السلة، ثم اكتب الكود في صفحة الدفع واضغط تطبيق. يتحقق الخادم من حالة الكوبون وتاريخه وحد الاستخدام ونوع الخصم والمادة المشمولة، ثم يعيد حساب الإجمالي. إذا رُفض الكود، راجع الكتابة والمسافات، وتأكد أنه لم ينتهِ أو يُستخدم بالكامل. لا تعتمد على الخصم حتى يظهر في الإجمالي النهائي.", [action("السلة", "/cart"), action("الطلبات والفواتير", "/dashboard?view=orders")], ["الكوبون لا يعمل", "كيف أعرف السعر النهائي؟"]);
    case "learning": return reply("للتعلم: 1) افتح درسًا مجانيًا من صفحة المادة أو افتح مادة مفعّلة من «موادي». 2) شغّل الفيديو واستخدم السرعة والصوت وملء الشاشة. 3) يتذكر المشغل تقدمك تلقائيًا للحساب. 4) بعد الاشتراك تظهر الوحدات والدروس المسموح بها على الويب والتطبيق. روابط الفيديو خاصة ومؤقتة، لذلك لا تشاركها ولا تعتمد على تنزيلها؛ إذا توقف التشغيل أعد فتح الدرس وتحقق من الاتصال ثم افتح الدعم.", [action("موادي", "/dashboard?view=courses"), action("استكشاف المواد", "/courses"), action("الدعم", "/support")], ["أريد درسًا مجانيًا", "الفيديو لا يعمل", "كيف أحفظ التقدم؟"]);
    case "thanks": return reply(`${firstName ? `العفو ${firstName}` : "العفو"}. إذا احتجت خطوة عملية داخل مراس، اكتب اسم الخدمة أو المشكلة وسأرتب لك الحل خطوة بخطوة.`, [action("مركز المساعدة", "/support"), action("استكشاف المواد", "/courses")], ["كيف أطلب مادة؟", "كيف أتابع تقدمي؟"]);
    case "profile": return reply("لإكمال ملفك: افتح «حسابي»، اختر الجامعة أولًا، ثم اختر تخصصًا تابعًا لها، وبعد ذلك حدّد المستوى الدراسي مثل الأول أو الثاني أو خريج. حفظ هذه البيانات يجعل التوصيات وطلبات المواد تصل إلى النطاق الصحيح. إذا لم يظهر تخصصك، اختر الجهة الصحيحة أو ارفع طلب مادة للدعم.", [action("إعدادات الحساب", "/dashboard?view=account"), action("طلب مادة", "/request-course")], ["كيف أغيّر جامعتي؟", "ما المستويات المتاحة؟"]);
    case "security": return reply("أمان الحساب يعتمد على كلمة مرور قوية، وعدم مشاركة رمز الاستعادة أو بيانات البطاقة، واستخدام الموقع والتطبيق الرسميين فقط. لا يطلب منك فريق مراس كلمة المرور داخل الدعم. إذا شككت في دخول غير معروف: غيّر كلمة المرور فورًا، سجّل الخروج من الأجهزة، ثم افتح تذكرة من البريد المسجل. حذف الحساب إجراء حساس ويحتاج تحققًا، بينما تبقى الفواتير وأحداث الدفع محفوظة للامتثال.", [action("استعادة كلمة المرور", "/forgot-password"), action("الدعم", "/support"), action("الخصوصية", "/privacy")], ["كيف أحمي حسابي؟", "أريد حذف حسابي"]);
    case "course_search": return reply(`للعثور على المادة بسرعة: 1) افتح المواد. 2) اكتب اسم المادة أو رمزها في البحث. 3) اختر الجامعة ثم التخصص إذا أردت تضييق النتائج، أو اختر «كل الجامعات» و«كل التخصصات» للبحث العام. 4) افتح بطاقة المادة لمراجعة الوصف والدرس المجاني والسعر قبل إضافتها للسلة. يعرض التطبيق توصيات جامعتك وتخصصك أولًا، لكنه لا يمنعك من تصفح باقي الكتالوج (${courses.length} مادة منشورة حاليًا).`, [action("استكشاف المواد", "/courses"), action("الجامعات والكليات", "/universities")], ["أريد مواد جامعتي", "هل أستطيع الشراء من جامعة أخرى؟"]);
    case "university": return reply(`يعرض دليل مراس ${institutions.length} جهة تعليمية منشورة. يمكنك البحث بالاسم أو المنطقة أو نوع الجهة، ثم فتح صفحة الجهة لرؤية التخصصات والمواد المرتبطة بها. إذا لم تجد جامعتك أو كلية معينة، اكتب اسمها كاملًا أو أرسل طلب مادة، وستحتاج الإدارة إلى إضافة الجهة وربط تخصصاتها قبل ظهورها في الفلاتر.`, [action("فتح دليل الجامعات", "/universities"), action("استكشاف المواد", "/courses"), action("طلب مادة أو جهة", "/request-course")], ["أريد تخصصات جامعة معينة", "كيف أختار التخصص؟"]);
    case "specialty": return reply("التخصصات تُعرض بحسب الجامعة المختارة حتى لا تختلط الخطط بين الجهات. افتح دليل الجامعات لاختيار الجهة، أو افتح المواد وحدد الجامعة ثم التخصص. قد يختلف اسم التخصص أو الخطة من جامعة إلى أخرى؛ لذلك راجع رمز المادة ووصفها. إذا كان تخصصك غير موجود، أكمل بيانات الحساب أولًا ثم أرسل طلب مادة مع اسم التخصص والجامعة.", [action("دليل الجامعات", "/universities"), action("بحث المواد", "/courses"), action("إكمال الحساب", "/dashboard?view=account")], ["ما مواد تخصصي؟", "تخصصي غير موجود"]);
    case "cart_favorites": return reply("السلة والمفضلة مرتبطتان بحسابك. اضغط القلب لإضافة المادة إلى المفضلة، واضغط «إضافة إلى السلة» لتهيئتها للشراء. يظهر عدد العناصر فوق الأيقونة، وتبقى المادة في القائمة حتى تزيلها يدويًا أو تُكمل عملية الشراء. المفضلة لا تمنح وصولًا للمحتوى؛ الوصول يبدأ فقط بعد تأكيد الدفع من الخادم.", [action("السلة", "/cart"), action("المفضلة", "/favorites"), action("المواد", "/courses")], ["كيف أزيل مادة من السلة؟", "لماذا لم تتفعل المادة؟"]);
    case "notifications": return reply("الإشعارات تعرض تحديثات الطلبات والشراء والدعم والإعلانات. عند فتح صفحة الإشعارات تُعلّم الإشعارات المقروءة بحسب حالة الحساب، ويمكنك الضغط على الإشعار ذي الرابط للانتقال مباشرة إلى المادة أو الطلب. في التطبيق، فعّل إذن Push من النظام وسجّل الجهاز بالحساب؛ إذا لم يصل إشعار، افتح التطبيق وتحقق من صفحة الإشعارات أولًا.", [action("الإشعارات", "/dashboard?view=notifications"), action("طلبات المواد", "/dashboard?view=requests"), action("الدعم", "/support")], ["لم يصلني إشعار", "كيف أتابع حالة الطلب؟"]);
    case "appearance": return reply("من إعدادات المظهر يمكنك التبديل بين الفاتح والليلي، اختيار سمة رسمية أو بنفسجية أو وردية أو تركوازية، وضبط حجم الخط. تُحفظ الإعدادات محليًا في الويب والتطبيق، وتُراعى في لوحة الطالب والمشرف والإدارة. إذا بقيت الشاشة على شكل قديم، أغلق الصفحة وأعد فتحها أو حدّث التطبيق إلى آخر نسخة.", [action("إعدادات المظهر", "/dashboard?view=account"), action("الرئيسية", "/")], ["كيف أفعل الوضع الليلي؟", "كبّر الخط"]);
    case "staff": return reply("تظهر لوحة الإدارة أو المشرف فقط للحسابات التي منحها الخادم الدور المناسب. المشرف يرى الطلبات والمواد المسندة إلى نطاقه ويمكنه تحديث الحالة ورفع فيديو الدرس، بينما المدير يدير الكتالوج والحسابات والدعم والإعدادات. لا يملك الطالب طريقًا لتصعيد دوره من الواجهة، وكل إجراء حساس يتحقق من الجلسة والصلاحية في الخادم.", user?.role === "admin" ? [action("لوحة الإدارة", "/admin")] : user?.role === "supervisor" ? [action("لوحة المشرف", "/supervisor")] : [action("لوحة الطالب", "/dashboard")], ["كيف أرفع فيديو؟", "كيف أصل للدعم؟"]);
    case "assistant": return reply("اكتب سؤالك بطريقتك حتى لو كان مختصرًا أو باللهجة أو فيه أخطاء إملائية. أفهم أسئلة التسجيل والدخول والجامعة والتخصص والمواد والدفع والكوبونات والسلة والمفضلة والمشغل وطلبات المواد والدعم والإشعارات والمظهر. في البيانات المتغيرة سأعتمد على سياق حسابك والكتالوج الحالي، ولن أخمّن حالة دفع أو معلومة خاصة.", [action("استكشاف المواد", "/courses"), action("الدعم", "/support")], ["ما لقيت مادتي", "كيف أشتري؟", "كيف أحمي حسابي؟"]);
    case "support": return reply(`للحصول على حل قابل للمتابعة، اكتب المشكلة والخطوة التي فشلت واسم الجهاز أو المتصفح ورقم الطلب إن وجد، ولا ترسل كلمة المرور أو بيانات البطاقة. افتح تذكرة من حسابك؛ ويمكنك استخدام ${whatsApp ? "واتساب للاستفسار العام، أما الدفع والحساب فالتذكرة أكثر خصوصية" : "البريد أو التذكرة لأن واتساب غير منشور حاليًا"}.`, [action("فتح تذكرة دعم", "/support"), ...(whatsApp ? [action("واتساب الدعم", whatsApp)] : []), action("صفحة التواصل", "/contact")], ["مشكلة في تسجيل الدخول", "مشكلة في الدفع", "مشكلة في الفيديو"]);
    case "files": return reply("الملف المقبول يعتمد على الخدمة: طلبات المواد تقبل PDF وPPT/PPTX وDOC/DOCX وPNG/JPG بإجمالي يصل إلى 100 ميجابايت، بينما مرفقات الدعم تقبل الأنواع الآمنة التي تظهر في منتقي الملفات. فيديوهات الدروس يرفعها المدير أو المشرف المصرح من مساحة المحتوى، وتُفحص بصمة الحاوية وتخزن في مساحة خاصة. استخدم ملفات تملك حق مشاركتها، وانتظر رسالة النجاح قبل إغلاق الصفحة.", [action("طلب مادة ورفع ملفات", "/request-course"), action("الدعم", "/support"), ...(user?.role === "admin" ? [action("لوحة الإدارة", "/admin")] : user?.role === "supervisor" ? [action("لوحة المشرف", "/supervisor")] : [])], ["كم حجم المرفق؟", "كيف أرفع فيديو؟"]);
    default: return null;
  }
}

function detectedInstitution(text: string, rows: Institution[]) {
  return [...rows].sort((a, b) => b.name.length - a.name.length).find((item) => {
    const full = normalize(item.name);
    const short = full.replace(/^(جامعه|الجامعه|كليه|كليات)\s+/, "");
    return text.includes(full) || (short.length > 5 && text.includes(short));
  });
}

function detectedProgram(text: string, rows: Course[]) {
  const dynamic = rows.flatMap((course) => [course.specialty]).filter(Boolean).map((name) => ({ name }));
  return [...allPrograms.map((item) => ({ name: item.name })), ...dynamic].sort((a, b) => b.name.length - a.name.length).find((item) => text.includes(normalize(item.name)));
}

export function answerAssistant(rawQuestion: string, user: SessionUser | null, publicSettings: PublicSettings = { ...PUBLIC_SETTING_DEFAULTS }, liveCatalog?: LiveAssistantCatalog): AssistantReply {
  const text = normalize(rawQuestion);
  const institutions = liveCatalog?.institutions?.length ? liveCatalog.institutions : bundledInstitutions;
  const courses = liveCatalog?.courses?.length ? liveCatalog.courses : bundledCourses;
  const institution = detectedInstitution(text, institutions);
  const program = detectedProgram(text, courses);
  const matchedCourse = courses.find((course) => text.includes(normalize(course.title)) || (course.code && text.includes(normalize(course.code))));
  const intent = detectAssistantIntent(text);
  const firstName = user?.fullName?.split(" ")[0];

  if (has(text, ["السلام", "مرحبا", "هلا", "اهلا", "صباح الخير", "مساء الخير"])) return {
    answer: `${firstName ? `أهلًا ${firstName}،` : "أهلًا بك،"} أنا مساعد مراس الذكي. أقدر أرشدك للتسجيل والجامعات والتخصصات والمواد والشراء والمشغل وطلبات المواد والدعم. اكتب سؤالك بطريقتك.`,
    actions: user ? [action("فتح لوحتي", "/dashboard")] : [action("إنشاء حساب", "/register")],
    suggestions: ["ما لقيت مادتي", "كيف أجرب درسًا؟", "كيف أحمي حسابي؟"],
  };

  if (matchedCourse) return {
    answer: `${matchedCourse.title} متاحة لطلاب ${matchedCourse.university} ضمن ${matchedCourse.specialty}. تحتوي ${matchedCourse.lessons} درسًا لمدة ${matchedCourse.duration}، وسعرها ${matchedCourse.price} ر.س. قبل الشراء راجع الوصف والدرس المجاني، ثم أضفها للسلة أو للمفضلة. بعد الدفع المؤكد من الخادم تظهر في «موادي».`,
    actions: [action("فتح صفحة المادة", `/courses/${matchedCourse.slug}`), action("تصفح مواد مشابهة", `/courses?q=${encodeURIComponent(matchedCourse.title)}`)],
    suggestions: ["هل فيها درس مجاني؟", "كيف أضيفها للسلة؟", "كيف أشتريها؟"],
  };

  if (institution) {
    const officialPrograms = getInstitutionPrograms(institution.slug).map((item) => item.name);
    const livePrograms = courses.filter((course) => course.universitySlug === institution.slug).map((course) => course.specialty);
    const programs = [...new Set([...livePrograms, ...officialPrograms])];
    const names = programs.slice(0, 14).join("، ");
    return {
      answer: `${institution.name} مدرجة في مراس ضمن ${institution.type === "حكومية" ? "الجامعات الحكومية" : institution.type === "أهلية" ? "الجامعات الأهلية" : "الكليات"} في ${institution.region}. من برامجها المدرجة: ${names || "راجع صفحة الجهة للبرامج المتاحة"}${programs.length > 14 ? `، وغيرها (${programs.length} برنامجًا في الدليل)` : ""}. افتح صفحتها للبحث في جميع البرامج ورؤية مواد كل تخصص ورابط المصدر الرسمي.`,
      actions: [action(`صفحة ${institution.name}`, `/universities/${institution.slug}`), action("طلب مادة لهذه الجهة", "/request-course")],
      suggestions: ["كيف أختار تخصصي؟", "ما المواد المتاحة؟"],
    };
  }

  if (program) {
    const names = [...new Set(courses.filter((course) => course.specialty === program.name).map((course) => course.title))];
    const fallbackNames = getProgramCourses(program.name);
    const listedNames = names.length ? names : fallbackNames;
    return {
      answer: `مواد ${program.name} المقترحة في الدليل تشمل: ${listedNames.join("، ") || "لا توجد مادة منشورة بهذا الاسم حاليًا"}. قد تختلف رموز المادة والخطة حسب الجامعة والسنة؛ افتح جامعتك لمطابقة برنامجها، أو أرسل توصيف المقرر إذا كانت المادة غير متاحة.`,
      actions: [action("البحث عن المواد", `/courses?q=${encodeURIComponent(program.name)}`), action("طلب مادة", "/request-course")],
    };
  }

  const enhancedFallback = intentFallback(intent, user, publicSettings, institutions, courses);
  if (enhancedFallback) return enhancedFallback;

  if (has(text, ["الجامعات", "الكليات", "جامعه", "كليه", "كم جامعه"])) return {
    answer: `يضم دليل مراس ${institutions.length} جامعة وكلية وجهة تقنية سعودية، مع البحث حسب الاسم والمنطقة والنوع. صفحة كل جهة تعرض تخصصاتها وموادها ومصدرها الرسمي.`,
    actions: [action("استعراض الجامعات والكليات", "/universities")],
    suggestions: ["جامعة الملك سعود", "جامعة أم القرى", "الكليات الصحية"],
  };

  if (has(text, ["جامعه ثانيه", "غير جامعتي", "باقي الجامعات", "تخصص ثاني", "اقدر اشترك من جامعه ثانيه", "مواد خارج تخصصي", "اتصفح الكل"])) return {
    answer: "نعم. تظهر لك توصيات جامعتك وتخصصك أولًا داخل لوحة الطالب، لكن فهرس مراس مفتوح لتصفح جميع الجامعات والتخصصات والمواد. يمكنك شراء أي مادة منشورة تناسبك حتى لو كانت مرتبطة بجهة أو تخصص آخر، وتبقى في «موادي» بعد تأكيد الدفع.",
    actions: [action("تصفح كل المواد", "/courses"), action("تصفح كل الجامعات", "/universities"), action("موادي", "/dashboard?view=courses")],
  };

  if (has(text, ["اشتري", "ابغى اشتري", "ابي اشتري", "كيف اشتري", "شراء", "ادفع", "الدفع", "تاب", "بطاقه", "مدى", "فيزا", "ماستر", "السعر", "بكم"])) return {
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
    answer: "في طلب المادة يمكنك رفع عدد ملفات غير محدد عمليًا ضمن إجمالي 100 ميجابايت، والأنواع المقبولة تشمل PDF وPPT/PPTX وDOC/DOCX وPNG/JPG، مع حد 15 ميجابايت للملف الواحد. ارفع التوصيف أو السلايدات التي يحق لك مشاركتها فقط.",
    actions: [action("رفع ملفات مع طلب مادة", "/request-course")],
  };

  if (has(text, ["الدعم", "مشكله", "مشكلة", "شكوى", "تواصل", "ساعدني", "ساعد", "احتاج مساعدة", "خطا", "خطأ", "ما يشتغل", "ما يفتح", "خربان"])) {
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

  const fallback = intentFallback(intent, user, publicSettings, institutions, courses);
  if (fallback) return fallback;
  return {
    answer: "أفهم أنك تحتاج مساعدة داخل مراس. سأحاول تحويل سؤالك إلى خطوة عملية: اكتب اسم الجامعة أو المادة، أو اذكر ما الذي حاولت فعله والرسالة التي ظهرت لك. أستطيع شرح التسجيل، الدخول، إكمال الملف، البحث والفلاتر، السلة والمفضلة، الدفع والكوبونات، المشغل، طلب المادة والملفات، الإشعارات، الدعم، والمظهر. إذا كان السؤال خارج المنصة فسأقدم معلومات عامة وأوضح ما يحتاج تحققًا من جهة مختصة.",
    actions: [action("مركز المساعدة", "/support"), action("استكشاف المواد", "/courses"), action("طلب مادة", "/request-course")],
    suggestions: ["كيف أسجل؟", "ما لقيت مادتي", "كيف أشتري؟", "مشكلة في الدخول"],
  };
}
