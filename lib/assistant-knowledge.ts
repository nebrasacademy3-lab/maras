import { allPrograms, getInstitutionPrograms } from "@/lib/academic-data";
import { courses as bundledCourses, institutions as bundledInstitutions, type Course, type Institution } from "@/lib/data";
import type { SessionUser } from "@/lib/auth";
import { PUBLIC_SETTING_DEFAULTS, type PublicSettings, whatsappHref } from "@/lib/platform-settings";
import { assistantMatchScore, detectAssistantLanguage, findBestAssistantMatch, normalizeAssistantText, type AssistantLanguage } from "@/lib/assistant-search";

export type AssistantAction = { label: string; href: string };
export type AssistantReply = { answer: string; actions: AssistantAction[]; suggestions?: string[] };

const has = (text: string, terms: string[]) => {
  return terms.some((term) => assistantMatchScore(text, term) >= 0.65);
};
const action = (label: string, href: string): AssistantAction => ({ label, href });

export type AssistantProgram = { slug?: string; name: string; aliases?: string[]; description?: string; faculty?: string; degree?: string; institutionSlugs?: string[] };
export type LiveAssistantCatalog = { institutions: Institution[]; courses: Course[]; programs?: AssistantProgram[] };
export type AssistantIntent = "greeting" | "registration" | "login" | "recovery" | "profile" | "security" | "policy" | "university" | "specialty" | "course_search" | "course_request" | "files" | "cart_favorites" | "payment" | "coupon" | "learning" | "notifications" | "support" | "appearance" | "staff" | "assistant" | "thanks" | "general";

export function detectAssistantIntent(rawQuestion: string): AssistantIntent {
  const text = normalizeAssistantText(rawQuestion);
  const rules: Array<[AssistantIntent, string[]]> = [
    ["greeting", ["السلام عليكم", "مرحبا", "اهلا", "هلا", "صباح الخير", "مساء الخير", "hello", "hi", "hey", "good morning", "good evening"]],
    ["thanks", ["شكرا", "مشكور", "يعطيك العافيه", "ممتاز", "تمام", "thanks", "thank you", "appreciate it", "great"]],
    ["recovery", ["نسيت كلمه المرور", "استعاده الحساب", "استرجاع الحساب", "رمز التحقق", "ما اتذكر الباسورد", "تغيير كلمه المرور", "forgot password", "reset password", "recover account", "verification code"]],
    ["policy", ["الشروط والاحكام", "سياسه الخصوصيه", "سياسه الاسترداد", "حقوق المحتوى", "سياسه الاستخدام", "terms and conditions", "privacy policy", "refund policy", "content policy", "terms of use"]],
    ["security", ["امن", "امان", "اختراق", "تسلل", "سرقه الحساب", "حذف حساب", "خصوصيه", "بياناتي", "security", "hacked", "privacy", "delete account", "stolen account"]],
    ["registration", ["انشاء حساب", "حساب جديد", "سجلت جديد", "ابغى اسجل", "التسجيل", "اشتراك حساب", "create account", "new account", "sign up", "signup", "register"]],
    ["login", ["تسجيل الدخول", "ما يدخل", "ما اقدر ادخل", "خطا في الدخول", "مشكله الدخول", "دخول حسابي", "log in", "login", "sign in", "signin", "cannot login", "cant login"]],
    ["profile", ["اكمل بياناتي", "المستوى الدراسي", "مستواي", "تغيير الجامعه", "تغيير التخصص", "ملفي", "بيانات الحساب", "جامعتي", "ما جامعتي", "تخصصي", "ما تخصصي", "بياناتي الجامعيه", "اخر طلب", "my profile", "account details", "change university", "change major", "academic level"]],
    ["course_request", ["ما لقيت مادتي", "ماده غير موجوده", "اطلب ماده", "توفير ماده", "طلب مقرر", "السلايدات", "التوصيف", "missing course", "request course", "request a course", "add a course", "course not found", "course outline", "slides"]],
    ["learning", ["درس مجاني", "المشغل", "الفيديو", "سرعه الفيديو", "اكمل الفيديو", "تقدم", "ملء الشاشه", "الجوده", "ما يشتغل الفيديو", "free lesson", "video player", "playback", "video speed", "fullscreen", "watch progress", "video not working"]],
    ["files", ["رفع ملف", "ارفع ملف", "مرفق", "مرفقات", "pdf", "بوربوينت", "حجم الملف", "رفع فيديو", "upload file", "attachment", "file size", "upload video", "powerpoint"]],
    ["coupon", ["كوبون", "قسيمه", "رمز خصم", "كود خصم", "بروموكود", "خصم", "coupon", "promo code", "discount code", "voucher"]],
    ["payment", ["اشتري", "شراء", "ادفع", "الدفع", "بطاقه", "مدى", "فيزا", "ماستر", "فاتوره", "استرداد", "استرجاع مبلغ", "عملية الدفع", "buy", "purchase", "payment", "checkout", "credit card", "invoice", "refund"]],
    ["cart_favorites", ["السله", "أضيف للسلة", "المفضله", "المفضلة", "القلب", "حفظ ماده", "cart", "basket", "favorites", "favourites", "wishlist", "save course"]],
    ["notifications", ["اشعار", "اشعارات", "تنبيه", "التنبيهات", "وصلني اشعار", "حاله الطلب", "notification", "notifications", "alert", "request status"]],
    ["appearance", ["الوضع الليلي", "الوضع الفاتح", "الثيم", "حجم الخط", "تكبير الخط", "تصغير الخط", "المظهر", "الشاشه", "dark mode", "light mode", "theme", "font size", "appearance"]],
    ["staff", ["المشرف", "الاداره", "لوحه المشرف", "صلاحيات", "رفع فيديو للمادة", "admin", "supervisor", "staff dashboard", "permissions"]],
    ["assistant", ["المساعد", "الذكاء الاصطناعي", "اسال المساعد", "كيف اسال", "assistant", "chatbot", "artificial intelligence"]],
    ["university", ["الجامعات", "الكليات", "جامعه", "كليه", "جهة تعليمية", "جامعة ثانيه", "غير جامعتي", "university", "universities", "college", "colleges", "institution"]],
    ["specialty", ["التخصص", "تخصصات", "تخصصي", "برنامج دراسي", "خطة دراسية", "major", "specialty", "specialisation", "specialization", "degree program", "study plan"]],
    ["course_search", ["المواد", "ماده", "مقرر", "ابحث عن مادة", "فلتر المواد", "كل المواد", "course", "courses", "subject", "module", "find course", "search courses"]],
    ["support", ["الدعم", "مشكله", "مشكلة", "شكوى", "ساعدني", "ما يشتغل", "ما يفتح", "خربان", "تواصل", "support", "help", "problem", "not working", "contact"]],
  ];
  return rules.find(([, terms]) => has(text, terms))?.[0] || "general";
}

function englishIntentFallback(intent: AssistantIntent, user: SessionUser | null, settings: PublicSettings, institutions: Institution[], courses: Course[]): AssistantReply | null {
  const whatsApp = whatsappHref(settings);
  const supportChannel = settings.support_email ? `Current support email: ${settings.support_email}; hours: ${settings.support_hours}.` : `The support email has not been published yet; use the support ticket. Hours: ${settings.support_hours}.`;
  const reply = (answer: string, actions: AssistantAction[], suggestions: string[] = []) => ({ answer, actions, suggestions });
  switch (intent) {
    case "registration": return reply("To create an account: open Registration, enter your name, email, Saudi mobile number, and a strong password, then choose an institution and one of its linked majors. Complete your academic level and accept the terms. Never share your password.", [action("Create account", "/register"), action("Sign in", "/login")], ["Why was registration rejected?", "What password should I use?"]);
    case "login": return reply("Sign in with the email or Saudi mobile number linked to your account and enter the password exactly as created. If it still fails, use password recovery instead of repeating attempts. Never send your password to support.", [action("Sign in", "/login"), action("Reset password", "/forgot-password")], ["I forgot my password", "My login still fails"]);
    case "recovery": return reply("Open Password recovery, enter the account email, and use the link in the recovery message before it expires. If the message does not arrive, check spam and then open a support ticket without sharing any verification code.", [action("Reset password", "/forgot-password"), action("Support", "/support")]);
    case "profile": {
      const institution = user ? institutions.find((item) => item.slug === user.universitySlug)?.nameEn || institutions.find((item) => item.slug === user.universitySlug)?.name || user.universitySlug || "not set" : "not set";
      return user ? reply(`Your current institution is ${institution}, and your major is ${user.specialty || "not set"}. Review or update these values in Account settings; your own requests are under Course requests.`, [action("Account settings", "/dashboard?view=account"), action("Course requests", "/dashboard?view=requests")]) : reply("Sign in first to view your account, institution, major, and requests securely.", [action("Sign in", "/login"), action("Create account", "/register")]);
    }
    case "security": return reply("Use a unique password and never share recovery codes, card data, or session links. If you suspect unauthorized access, reset the password immediately and contact support from the registered account. Account deletion requires identity verification.", [action("Reset password", "/forgot-password"), action("Privacy", "/privacy"), action("Support", "/support")]);
    case "policy": return reply("Use the published policy pages for the current terms; I won’t invent a deadline or eligibility rule that is not stated there. Refund requests are reviewed through support using the order number, while privacy and content-use rules have their own pages.", [action("Terms", "/terms"), action("Privacy", "/privacy"), action("Refund policy", "/refund-policy"), action("Content policy", "/content-policy")]);
    case "course_search": return reply(`There are ${courses.length} published courses in the live catalog. Search by Arabic or English title or course code, then filter by institution and major. Open the course page to verify its current price, access period, lessons, and preview before checkout.`, [action("Browse courses", "/courses"), action("Browse institutions", "/universities")], ["Show courses for my major", "Can I browse another university?"]);
    case "course_request": return reply("If a course is missing, open Course request, enter its title and code if known, add useful notes, and attach only files you are allowed to share. Submit it and track the live status in your dashboard. A course request is not a purchase and does not require payment.", [action("Request a course", "/request-course"), action("Track requests", "/dashboard?view=requests")]);
    case "university": return reply(`The live directory currently contains ${institutions.length} published institutions. Search by Arabic or English name, region, or type, then open an institution to view its linked majors and published courses.`, [action("Institution directory", "/universities"), action("Browse courses", "/courses")]);
    case "specialty": return reply("Majors are linked to each institution, so choose the institution first. Course codes and study plans may differ between institutions; verify the course page or submit the official outline if the course is missing.", [action("Institution directory", "/universities"), action("Search courses", "/courses"), action("Request a course", "/request-course")]);
    case "payment": return reply("Sign in, complete your academic profile, review the live course page and preview, then continue through the cart and Tap checkout. Access is granted only after the server confirms payment. For a payment issue, share the order number with support—never card details.", [action("Browse courses", "/courses"), action("Cart", "/cart"), action("Orders and invoices", "/dashboard?view=orders")]);
    case "coupon": return reply("Enter the coupon at checkout and apply it before payment. The server checks its status, dates, usage limit, and eligible course, then recalculates the final total. Treat the coupon as applied only when the final checkout total changes.", [action("Cart", "/cart"), action("Orders and invoices", "/dashboard?view=orders")]);
    case "cart_favorites": return reply("Favorites save courses for later; the cart prepares them for checkout. Neither grants course access. Access starts only after the server confirms payment.", [action("Cart", "/cart"), action("Favorites", "/favorites"), action("Courses", "/courses")]);
    case "learning": return reply("Open a free preview from the course page or an activated course from My courses. The player saves progress to your account and supports playback, speed, volume, quality, and fullscreen. If playback fails, reopen the lesson, check the connection, then contact support.", [action("My courses", "/dashboard?view=courses"), action("Browse courses", "/courses"), action("Support", "/support")]);
    case "notifications": return reply("Notifications contain course-request, purchase, support, and announcement updates. Open Notifications in your dashboard; in the app, also allow push notifications in the device settings.", [action("Notifications", "/dashboard?view=notifications"), action("Course requests", "/dashboard?view=requests")]);
    case "appearance": return reply("Use Appearance settings to switch light/dark mode and adjust theme and text size. These preferences are stored separately for the web and app.", [action("Account settings", "/dashboard?view=account")]);
    case "files": return reply("Course requests accept PDF, PPT/PPTX, DOC/DOCX, PNG, and JPG files, up to 100 files and 100 MB total. Upload only material you are allowed to share. Lesson videos can only be uploaded by authorized staff.", [action("Request a course", "/request-course"), action("Support", "/support")]);
    case "staff": return reply("Admin and supervisor areas are available only when the server-assigned role permits them. Students cannot elevate their own role.", user?.role === "admin" ? [action("Admin area", "/admin")] : user?.role === "supervisor" ? [action("Supervisor area", "/supervisor")] : [action("Student dashboard", "/dashboard")]);
    case "assistant": return reply("Ask naturally in Arabic or English, including common spelling mistakes. I use the current catalog and your own account context when available; I will not guess prices, availability, payment status, or private data.", [action("Browse courses", "/courses"), action("Support", "/support")]);
    case "support": return reply(`Describe the failed step, the exact message, and your device or browser. Include an order number only if relevant, and never send a password or card details. ${supportChannel}`, [action("Open support ticket", "/support"), ...(whatsApp ? [action("WhatsApp support", whatsApp)] : []), action("Contact", "/contact")]);
    case "thanks": return reply("You’re welcome. Tell me the service, institution, course, or exact error and I’ll point you to the next verified step.", [action("Browse courses", "/courses"), action("Support", "/support")]);
    default: return null;
  }
}

function intentFallback(intent: AssistantIntent, user: SessionUser | null, settings: PublicSettings, institutions: Institution[], courses: Course[], language: AssistantLanguage): AssistantReply | null {
  if (language === "en") return englishIntentFallback(intent, user, settings, institutions, courses);
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
    case "profile": {
      const institutionName = user ? institutions.find((item) => item.slug === user.universitySlug)?.name || user.universitySlug || "غير محددة" : "غير محددة";
      return user
        ? reply(`بيانات حسابك الحالية: الجامعة ${institutionName}، والتخصص ${user.specialty || "غير محدد"}. يمكنك مراجعة آخر طلب مادة وحالته من قسم الطلبات، وتعديل بياناتك الجامعية من «حسابي».`, [action("متابعة طلبات المواد", "/dashboard?view=requests"), action("إعدادات الحساب", "/dashboard?view=account")], ["ما حالة آخر طلب؟", "كيف أغيّر جامعتي؟"])
        : reply("سجّل الدخول أولًا لعرض جامعتك وتخصصك وطلباتك بأمان. بعد الدخول افتح «حسابي» لتحديث الجامعة والتخصص والمستوى الدراسي.", [action("تسجيل الدخول", "/login"), action("إنشاء حساب", "/register")], ["كيف أكمل ملفي؟", "ما المستويات المتاحة؟"]);
    }
    case "security": return reply("أمان الحساب يعتمد على كلمة مرور قوية، وعدم مشاركة رمز الاستعادة أو بيانات البطاقة، واستخدام الموقع والتطبيق الرسميين فقط. لا يطلب منك فريق مراس كلمة المرور داخل الدعم. إذا شككت في دخول غير معروف: غيّر كلمة المرور فورًا، سجّل الخروج من الأجهزة، ثم افتح تذكرة من البريد المسجل. حذف الحساب إجراء حساس ويحتاج تحققًا، بينما تبقى الفواتير وأحداث الدفع محفوظة للامتثال.", [action("استعادة كلمة المرور", "/forgot-password"), action("الدعم", "/support"), action("الخصوصية", "/privacy")], ["كيف أحمي حسابي؟", "أريد حذف حسابي"]);
    case "policy": return reply("اعتمد على صفحات السياسات المنشورة لمعرفة الحكم الحالي؛ لن أفترض مدة أو أهلية غير مكتوبة. تُراجع طلبات الاسترداد عبر تذكرة دعم برقم الطلب، بينما توجد صفحات مستقلة للشروط والخصوصية وحقوق المحتوى.", [action("الشروط", "/terms"), action("الخصوصية", "/privacy"), action("سياسة الاسترداد", "/refund-policy"), action("حقوق المحتوى", "/content-policy")]);
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
  return findBestAssistantMatch(text, rows, (item) => [item.name, item.nameEn, ...(item.aliases || []), item.slug, item.domain?.split(".")[0]], 0.74);
}

function assistantPrograms(courses: Course[], livePrograms?: AssistantProgram[]) {
  const rows: AssistantProgram[] = [
    ...(livePrograms || []),
    ...(livePrograms ? [] : allPrograms.map((item) => ({ name: item.name, aliases: item.aliases, degree: item.degree }))),
    ...courses.map((course) => ({ name: course.specialty, institutionSlugs: [course.universitySlug] })),
  ];
  const merged = new Map<string, AssistantProgram>();
  for (const row of rows) {
    const key = normalizeAssistantText(row.name);
    const current = merged.get(key);
    merged.set(key, current ? {
      ...current,
      ...row,
      aliases: [...new Set([...(current.aliases || []), ...(row.aliases || [])])],
      institutionSlugs: [...new Set([...(current.institutionSlugs || []), ...(row.institutionSlugs || [])])],
    } : row);
  }
  return [...merged.values()];
}

function detectedProgram(text: string, rows: AssistantProgram[]) {
  return findBestAssistantMatch(text, rows, (item) => [item.name, ...(item.aliases || []), item.slug], 0.75);
}

function detectedCourse(text: string, rows: Course[]) {
  return findBestAssistantMatch(text, rows, (item) => [item.title, item.titleEn, item.code, item.slug], 0.74);
}

function detectedLesson(text: string, rows: Course[]) {
  const lessons = rows.flatMap((course) => course.units.flatMap((unit) => unit.lessons.map((lesson) => ({ course, unit: unit.title, lesson }))));
  return findBestAssistantMatch(text, lessons, (item) => [item.lesson.title], 0.77);
}

export function answerAssistant(rawQuestion: string, user: SessionUser | null, publicSettings: PublicSettings = { ...PUBLIC_SETTING_DEFAULTS }, liveCatalog?: LiveAssistantCatalog): AssistantReply {
  const text = normalizeAssistantText(rawQuestion);
  const language = detectAssistantLanguage(rawQuestion);
  const institutions = liveCatalog ? liveCatalog.institutions : bundledInstitutions;
  const courses = liveCatalog ? liveCatalog.courses : bundledCourses;
  const programs = assistantPrograms(courses, liveCatalog?.programs);
  const institutionMatch = detectedInstitution(text, institutions);
  const programMatch = detectedProgram(text, programs);
  const courseMatch = detectedCourse(text, courses);
  const lessonMatch = detectedLesson(text, courses);
  const institution = institutionMatch?.row;
  const program = programMatch?.row;
  const matchedCourse = courseMatch?.row;
  const intent = detectAssistantIntent(text);
  const preferLesson = Boolean(lessonMatch && (intent === "learning" || !courseMatch || lessonMatch.score >= courseMatch.score));
  const firstName = user?.fullName?.split(" ")[0];

  if (intent === "greeting") return language === "en" ? {
    answer: `${firstName ? `Hello ${firstName},` : "Hello,"} I’m the Meras assistant. Ask naturally in Arabic or English about institutions, majors, courses, lessons, registration, payment, or support. I’ll use the current catalog and your own account context when available.`,
    actions: user ? [action("Open my dashboard", "/dashboard")] : [action("Create account", "/register")],
    suggestions: ["Find a course", "How do I watch a free lesson?", "I need support"],
  } : {
    answer: `${firstName ? `أهلًا ${firstName}،` : "أهلًا بك،"} أنا مساعد مراس الذكي. اسألني بطريقتك عن التسجيل أو الجامعات والتخصصات والمواد والدروس والدفع والمشغل وطلبات المواد والدعم، وسأعتمد على الكتالوج الحالي وسياق حسابك عند توفره.`,
    actions: user ? [action("فتح لوحتي", "/dashboard")] : [action("إنشاء حساب", "/register")],
    suggestions: ["ما لقيت مادتي", "كيف أجرب درسًا؟", "كيف أحمي حسابي؟"],
  };

  if (matchedCourse && !preferLesson) return {
    answer: language === "en"
      ? `${matchedCourse.titleEn || matchedCourse.title} is a published course for ${matchedCourse.university}, major ${matchedCourse.specialty}. The live catalog currently shows ${matchedCourse.lessons} lessons, ${matchedCourse.duration} total duration, and a price of SAR ${matchedCourse.price}.${matchedCourse.availableForPurchase === false ? " It is not open for purchase yet because no ready lesson is available." : " Verify the description, access period, and any free preview on the course page before checkout."}`
      : `${matchedCourse.title} مادة منشورة لجهة ${matchedCourse.university} ضمن تخصص ${matchedCourse.specialty}. يعرض الكتالوج الحالي ${matchedCourse.lessons} درسًا بمدة إجمالية ${matchedCourse.duration} وسعر ${matchedCourse.price} ر.س.${matchedCourse.availableForPurchase === false ? " المادة ليست مفتوحة للشراء بعد لعدم وجود درس جاهز للمشاهدة." : " راجع الوصف ومدة الوصول والدرس المجاني — إن وجد — في صفحة المادة قبل الشراء."}`,
    actions: [action(language === "en" ? "Open course" : "فتح صفحة المادة", `/courses/${matchedCourse.slug}`), action(language === "en" ? "Similar courses" : "تصفح مواد مشابهة", `/courses?q=${encodeURIComponent(matchedCourse.title)}`)],
    suggestions: language === "en" ? ["Does it have a free preview?", "What lessons are included?", "How do I buy it?"] : ["هل فيها درس مجاني؟", "ما الدروس الموجودة؟", "كيف أشتريها؟"],
  };

  if (lessonMatch) {
    const { course, unit, lesson } = lessonMatch.row;
    return language === "en" ? {
      answer: `${lesson.title} is listed under ${unit} in ${course.titleEn || course.title}. Its current duration is ${lesson.duration}.${lesson.ready === false ? " The lesson is listed, but its video is not ready for playback yet." : lesson.free ? " It is marked as a free preview." : " Access depends on the user’s active course entitlement."}`,
      actions: [action("Open course", `/courses/${course.slug}`), action("My courses", "/dashboard?view=courses")],
      suggestions: ["What other lessons are included?", "Is there a free preview?"],
    } : {
      answer: `درس «${lesson.title}» مدرج ضمن «${unit}» في مادة ${course.title}، ومدته الحالية ${lesson.duration}.${lesson.ready === false ? " الدرس مدرج لكن الفيديو غير جاهز للمشاهدة بعد." : lesson.free ? " وهو محدد كدرس تجريبي مجاني." : " وتحتاج مشاهدته إلى صلاحية فعالة للمادة."}`,
      actions: [action("فتح المادة", `/courses/${course.slug}`), action("موادي", "/dashboard?view=courses")],
      suggestions: ["ما بقية الدروس؟", "هل يوجد درس مجاني؟"],
    };
  }

  if (institution) {
    const liveNames = programs.filter((item) => item.institutionSlugs?.includes(institution.slug)).map((item) => item.name);
    const fallbackNames = liveCatalog?.programs ? [] : getInstitutionPrograms(institution.slug).map((item) => item.name);
    const names = [...new Set([...liveNames, ...fallbackNames])];
    return language === "en" ? {
      answer: `${institution.nameEn || institution.name} is a published institution in ${institution.region}. The current directory links ${names.length} majors${names.length ? `, including ${names.slice(0, 10).join(", ")}${names.length > 10 ? ", and more" : ""}` : "; no linked major names are currently published"}. Open the institution page for the authoritative live list and its published courses.`,
      actions: [action("Open institution", `/universities/${institution.slug}`), action("Browse courses", `/courses?university=${encodeURIComponent(institution.slug)}`)],
      suggestions: ["Which courses are published?", "How do I choose my major?"],
    } : {
      answer: `${institution.name} جهة منشورة في دليل مراس ضمن ${institution.region}. يرتبط بها حاليًا ${names.length} تخصصًا${names.length ? `، منها: ${names.slice(0, 10).join("، ")}${names.length > 10 ? "، وغيرها" : ""}` : "، ولا توجد أسماء تخصصات مرتبطة منشورة حاليًا"}. افتح صفحة الجهة لرؤية القائمة الحية الكاملة والمواد المنشورة دون تخمين.` ,
      actions: [action(`صفحة ${institution.name}`, `/universities/${institution.slug}`), action("مواد الجهة", `/courses?university=${encodeURIComponent(institution.slug)}`), action("طلب مادة", "/request-course")],
      suggestions: ["ما المواد المنشورة؟", "كيف أختار تخصصي؟"],
    };
  }

  if (program) {
    const names = [...new Set(courses.filter((course) => assistantMatchScore(course.specialty, program.name) >= 0.86).map((course) => language === "en" ? course.titleEn || course.title : course.title))];
    return language === "en" ? {
      answer: names.length ? `The live catalog currently has ${names.length} published course(s) linked to ${program.name}: ${names.slice(0, 12).join(", ")}${names.length > 12 ? ", and more" : ""}. Course codes and plans can differ by institution, so verify the institution filter.` : `I found ${program.name} in the directory, but there is no published course linked to it in the current catalog. I won’t invent a course list; you can submit the official course title or outline as a request.`,
      actions: [action("Search this major", `/courses?q=${encodeURIComponent(program.name)}`), action("Request a course", "/request-course")],
    } : {
      answer: names.length ? `يعرض الكتالوج الحي ${names.length} مادة منشورة مرتبطة بتخصص ${program.name}: ${names.slice(0, 12).join("، ")}${names.length > 12 ? "، وغيرها" : ""}. قد تختلف الرموز والخطة بحسب الجامعة، لذلك استخدم فلتر الجهة للتأكد.` : `وجدت تخصص ${program.name} في الدليل، لكن لا توجد مادة منشورة مرتبطة به في الكتالوج الحالي. لن أفترض أسماء مواد غير موجودة؛ يمكنك إرسال اسم المقرر أو توصيفه في طلب مادة.`,
      actions: [action("البحث في التخصص", `/courses?q=${encodeURIComponent(program.name)}`), action("طلب مادة", "/request-course")],
    };
  }

  const enhancedFallback = intentFallback(intent, user, publicSettings, institutions, courses, language);
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
    answer: "في طلب المادة يمكنك رفع حتى 100 ملف ضمن إجمالي 100 ميجابايت، والأنواع المقبولة تشمل PDF وPPT/PPTX وDOC/DOCX وPNG/JPG. يعرض النموذج نسبة الرفع والسرعة والوقت المتبقي ويمكنك إلغاء العملية. ارفع التوصيف أو السلايدات التي يحق لك مشاركتها فقط.",
    actions: [action("رفع ملفات مع طلب مادة", "/request-course")],
  };

  if (has(text, ["الدعم", "مشكله", "مشكلة", "شكوى", "تواصل", "ساعدني", "ساعد", "احتاج مساعدة", "خطا", "خطأ", "ما يشتغل", "ما يفتح", "خربان"])) {
    const whatsApp = whatsappHref(publicSettings);
    return {
      answer: `افتح تذكرة دعم واكتب وصف المشكلة واسم المادة ورقم الطلب إن وجد. لا تشارك كلمة المرور أو بيانات البطاقة.${publicSettings.support_email ? ` بريد الدعم: ${publicSettings.support_email}،` : " لم يُنشر بريد الدعم بعد؛ استخدم التذكرة،"} وساعات العمل: ${publicSettings.support_hours}.${whatsApp ? " ويمكنك أيضًا بدء محادثة واتساب من الزر أدناه." : " لم تنشر الإدارة رقم واتساب بعد."}`,
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

  const fallback = intentFallback(intent, user, publicSettings, institutions, courses, language);
  if (fallback) return fallback;
  if (language === "en") return {
    answer: "I can help with Meras, but I don’t have enough verified detail to answer that precisely. Give me the institution, major, course or lesson name—or the exact error and the step that failed. I’ll search the current catalog and your own account context when available, and I won’t guess availability, prices, payment status, or policy terms.",
    actions: [action("Browse courses", "/courses"), action("Support", "/support"), action("Request a course", "/request-course")],
    suggestions: ["Find a course", "I cannot sign in", "A video will not play", "How do I request a course?"],
  };
  return {
    answer: "أستطيع مساعدتك داخل مراس، لكن لا توجد في سؤالك تفاصيل موثوقة تكفي لإجابة دقيقة. اكتب اسم الجامعة أو التخصص أو المادة أو الدرس، أو اذكر الخطوة التي فشلت ورسالة الخطأ كما ظهرت. سأبحث في الكتالوج الحالي وسياق حسابك عند توفره، ولن أخمّن التوفر أو السعر أو حالة الدفع أو نص سياسة غير منشور.",
    actions: [action("مركز المساعدة", "/support"), action("استكشاف المواد", "/courses"), action("طلب مادة", "/request-course")],
    suggestions: ["كيف أسجل؟", "ما لقيت مادتي", "كيف أشتري؟", "مشكلة في الدخول"],
  };
}
