import type { InformationContent } from "./information-contract";

const access = "تظهر المواد والخدمات المفعلة مسبقًا في حسابك عند تسجيل الدخول بالحساب نفسه. لا ينفذ هذا التطبيق عمليات شراء. إذا لم يظهر محتواك، حدّث صفحة تعلّمي وتواصل مع الدعم برقم طلبك، دون إرسال بيانات البطاقة أو رموز التحقق.";
const commerce = /اشتر|الشراء|شراء|الدفع|ادفع|سداد|كوبون|قسيمة|خصم|سعر|أسعار|اسعار|تمارا|تابي|تحويل بنكي|\b(buy|purchase|checkout|payment|pay|price|pricing|coupon|discount|subscribe|subscription|tap|tamara|tabby)\b|https?:\/\/|www\.|marasalelm\.com/i;
type Reply = { answer: string; actions: {label:string;href:string}[]; suggestions?: string[] };
/** Remote web-assistant marketing copy cannot turn the native guide into a payment CTA. */
export function readerReply(reply: Reply, question: string): Reply {
  const english = !/[\u0600-\u06ff]/.test(question);
  if (commerce.test(question) || commerce.test(reply.answer)) return {
    answer: english ? "Use the same account to access your existing courses and enabled tools. This app does not process purchases. Refresh My Learning; contact support with your order reference if access is missing. Never share card details, passwords or verification codes." : access,
    actions: [{ label: english ? "My learning" : "تعلّمي", href: "/learn" }, { label: english ? "Support" : "الدعم", href: "/support" }],
    suggestions: english ? ["Find my courses", "Playback help"] : ["أين أجد دروسي؟", "حل مشكلة تشغيل الدرس"],
  };
  return { ...reply, suggestions: reply.suggestions?.filter(text => !commerce.test(text)).slice(0, 5) };
}

/** A native usage guide, not a remotely editable copy of the website's checkout FAQ. */
export const READER_INFORMATION: InformationContent = {
  about: {
    title: "عن مراس العلم",
    intro: "شرح منظّم لموادك، ومصادر مراجعتك وتقدّمك الدراسي في حساب واحد.",
    mission: "نساعد طالب الجامعة على الوصول إلى شرح واضح ومصادر منظمة ومتابعة تعلمه من أي جهاز معتمد.",
    vision: "تجربة تعليمية مساندة وواضحة تتطور بناءً على احتياجات الطلاب وملاحظاتهم.",
    why: [
      { title: "دروسك في مكان واحد", body: "شاهد المواد المفعلة في حسابك، وافتح ملفات الدرس وراجع تقدمك." },
      { title: "خصوصية حسابك", body: "جلسات خاصة وأجهزة معتمدة وصلاحيات للمحتوى، مع أدوات لإدارة أمان الحساب." },
      { title: "مراجعة من المصدر", body: "أدوات للمذاكرة من ملفاتك. راجع ناتج الذكاء الاصطناعي؛ فهو لا يغني عن المصدر أو المعلم." },
      { title: "دعم مرتبط بحسابك", body: "أرسل تذكرتك وتابع الرد من داخل التطبيق، ولا تشارك كلمات المرور أو رموز التحقق." },
    ],
  },
  faq: [
    {id:"native-access",category:"learning",question:"أين أجد المواد المفعلة في حسابي؟",answer:access},
    {id:"native-preview",category:"learning",question:"كيف أشاهد معاينة الدرس؟",answer:"افتح تفاصيل المادة من تبويب المواد، ثم اختر الدرس التجريبي المتاح. قد لا تتوفر معاينة لبعض المواد بعد."},
    {id:"native-missing",category:"learning",question:"المادة موجودة بحسابي ولكنها لا تظهر هنا؟",answer:"تأكد من البريد المستخدم، وحدّث تبويب تعلّمي. راجع صلاحية الوصول في حسابك. إذا استمرت المشكلة، أرسل رقم الطلب للدعم ولا تكرر أي عملية."},
    {id:"native-video",category:"learning",question:"توقف تشغيل الفيديو؛ ماذا أفعل؟",answer:"تحقق من الاتصال، واخفض الجودة من المشغل، ثم أعد فتح الدرس. يحتفظ التطبيق بآخر تقدم محفوظ. أخبر الدعم باسم المادة والدرس ورسالة الخطأ إذا استمر العطل."},
    {id:"native-download",category:"learning",question:"كيف أحفظ ملف الدرس أو العقد؟",answer:"اضغط تنزيل داخل الصفحة المسموحة لحسابك، ثم اختر مكان الحفظ أو المشاركة. قد تتطلب المستندات الإدارية تحققًا إضافيًا. الفيديو المحمي لا يُنزّل كملف مستقل."},
    {id:"native-request",category:"start",question:"لم أجد المادة التي أدرسها؟",answer:"افتح طلب مادة، ثم أدخل الجامعة والتخصص واسم المقرر وارفع ملفات يحق لك مشاركتها. تابع حالة الطلب؛ إرساله لا يضمن موعد توفير المادة."},
    {id:"native-device",category:"security",question:"كيف أغيّر جهازي المعتمد؟",answer:"اتبع رسالة إدارة الأجهزة عند تسجيل الدخول. تواصل مع الدعم عند الحاجة؛ لا تحاول استخدام حساب شخص آخر لتجاوز الحماية."},
    {id:"native-delete",category:"security",question:"كيف أحذف حسابي؟",answer:"افتح الحساب ثم الأمان والخصوصية وخيار حذف الحساب. اقرأ أثر الحذف والبيانات التي قد يلزم الاحتفاظ بها، وأكّد هويتك لإتمام الطلب."},
    {id:"native-ai",category:"tools",question:"هل تُرسل ملفاتي إلى مزوّد ذكاء اصطناعي؟",answer:"تُرسل الأسئلة والملفات التي تختار معالجتها إلى Google Gemini بعد موافقتك. لا ترفق بيانات حساسة لا تملك إذن مشاركتها، وراجع الإجابات بمقارنتها بمصادرك."},
    {id:"native-alert",category:"security",question:"هل يجب السماح بالإشعارات؟",answer:"الإشعارات اختيارية. يمكنك استخدام التطبيق دون السماح بها، ومراجعة التنبيهات من داخل حسابك."},
    {id:"native-support",category:"support",question:"كيف أتواصل مع الدعم؟",answer:"افتح الدعم من حسابك، وأرسل وصف المشكلة واسم المادة أو رقم الطلب عند الحاجة. لا تشارك كلمة المرور أو رموز المصادقة."},
  ],
};
