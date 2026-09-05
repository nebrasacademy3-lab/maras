import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  CircleHelp,
  FileText,
  Landmark,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublicSettings } from "@/lib/platform-settings";
import styles from "../legal.module.css";

const EFFECTIVE_DATE = "05 سبتمبر 2026";
const DOCUMENT_VERSION = "1.0";

export const metadata: Metadata = {
  title: "سياسة الخصوصية",
  description: "سياسة خصوصية منصة مراس العلم: البيانات التي تُجمع، وأغراض معالجتها، ومدة الاحتفاظ بها، وحقوق المستخدم وطرق التواصل والشكوى.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "سياسة الخصوصية | مراس العلم",
    description: "تعرف على كيفية تعامل مراس العلم مع البيانات الشخصية وحقوق المستخدم.",
    url: "/privacy",
    locale: "ar_SA",
    type: "article",
  },
};

export default async function PrivacyPage() {
  const settings = await getPublicSettings();
  const operatorName = settings.legal_name.trim() || "مراس العلم";
  const sections = [
    { id: "scope", title: "نطاق السياسة وهوية الجهة المشغلة" },
    { id: "collected-data", title: "البيانات التي نجمعها" },
    { id: "purposes", title: "أغراض المعالجة وأساسها" },
    { id: "payments", title: "بيانات الدفع والمعاملات" },
    { id: "technical-data", title: "ملفات الارتباط والبيانات التقنية" },
    { id: "providers", title: "مزودو المعالجة التقنية والنقل الخارجي" },
    { id: "retention", title: "الاحتفاظ بالبيانات وإتلافها" },
    { id: "security", title: "حماية البيانات" },
    { id: "rights", title: "حقوق صاحب البيانات" },
    { id: "minors", title: "القاصرون وناقصو الأهلية" },
    { id: "updates", title: "تحديث السياسة" },
    { id: "complaints", title: "التواصل والشكاوى" },
  ];

  const identityRows = [
    { label: settings.legal_name ? "الاسم النظامي" : "الاسم التجاري", value: operatorName },
    { label: "رقم السجل التجاري", value: settings.commercial_registration_number.trim() },
    { label: "رقم توثيق التجارة الإلكترونية", value: settings.ecommerce_authentication_number.trim() },
    { label: "العنوان النظامي", value: settings.legal_address.trim() },
  ].filter((row) => row.value);

  return (
    <main className={styles.page} lang="ar" dir="rtl">
      <SiteHeader />
      <header className={styles.hero}>
        <div className="container">
          <nav className={styles.breadcrumbs} aria-label="مسار التنقل">
            <Link href="/">الرئيسية</Link><ChevronLeft size={13} aria-hidden="true" /><span>سياسة الخصوصية</span>
          </nav>
          <div className={styles.heroGrid}>
            <div>
              <span className={styles.eyebrow}><ShieldCheck size={15} aria-hidden="true" /> الخصوصية والبيانات</span>
              <h1>سياسة الخصوصية</h1>
              <p className={styles.lead}>توضح هذه السياسة كيف يتعامل {operatorName} مع البيانات الشخصية عند استخدام الموقع أو التطبيقات أو الخدمات التعليمية المرتبطة بهما.</p>
            </div>
            <div className={styles.versionCard} aria-label="بيانات إصدار الوثيقة">
              <CalendarDays aria-hidden="true" />
              <div><small>تاريخ النفاذ</small><strong>{EFFECTIVE_DATE}</strong><small>الإصدار {DOCUMENT_VERSION}</small></div>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.content}>
        <div className={["container", styles.layout].join(" ")}>
          <article className={styles.article}>
            <div className={styles.notice}>
              <FileText aria-hidden="true" />
              <div><strong>ملخص واضح</strong>لا نبيع بياناتك الشخصية. نعالج القدر اللازم لتشغيل الحساب وتقديم المحتوى وإتمام الطلبات وحماية المنصة ودعم المستخدم، مع مراعاة الحقوق والالتزامات النظامية ذات الصلة.</div>
            </div>

            <section className={styles.section} id="scope">
              <span className={styles.number}>01</span>
              <div>
                <h2>نطاق السياسة وهوية الجهة المشغلة</h2>
                <p>تسري هذه السياسة على البيانات التي تُجمع من خلال منصة مراس العلم على الويب والتطبيقات، وعلى المراسلات وطلبات الدعم والشراء والخدمات المرتبطة بالحساب. وتكون الجهة النظامية المبينة في بطاقة «بيانات الجهة المشغلة» هي المسؤولة عن تحديد أغراض المعالجة ووسائلها متى كانت تلك البيانات مدخلة ومعتمدة.</p>
                <p>لا تشمل هذه السياسة المواقع أو الخدمات الخارجية المستقلة التي قد تنتقل إليها باختيارك؛ وتخضع تلك الخدمات لسياساتها الخاصة.</p>
              </div>
            </section>

            <section className={styles.section} id="collected-data">
              <span className={styles.number}>02</span>
              <div>
                <h2>البيانات التي نجمعها</h2>
                <ul>
                  <li>بيانات التسجيل والحساب، مثل الاسم والبريد الإلكتروني ورقم الجوال وبيانات التحقق وتفضيلات اللغة.</li>
                  <li>البيانات التعليمية التي يضيفها المستخدم، مثل الجامعة والتخصص والمواد والتقدم والملاحظات والتفضيلات التعليمية.</li>
                  <li>بيانات الطلبات والاشتراكات والفواتير والمبالغ وحالة العملية والمراجع الصادرة من مقدم خدمات الدفع.</li>
                  <li>المحتوى الذي يرسله المستخدم، بما في ذلك طلبات المواد والملفات المرفوعة ورسائل الدعم والتقييمات والبلاغات.</li>
                  <li>بيانات الاستخدام والحماية، مثل عنوان الشبكة ونوع الجهاز ونظام التشغيل وسجل الدخول والجلسات والأحداث اللازمة لاكتشاف الأعطال أو إساءة الاستخدام.</li>
                </ul>
                <p>نطلب من المستخدم ألّا يرفع بيانات شخصية لا تلزم للخدمة، أو بيانات تخص شخصًا آخر من دون صفة أو إذن مناسب.</p>
              </div>
            </section>

            <section className={styles.section} id="purposes">
              <span className={styles.number}>03</span>
              <div>
                <h2>أغراض المعالجة وأساسها</h2>
                <p>نعالج البيانات لإنشاء الحساب والتحقق منه، وتقديم الخدمة المتعاقد عليها، وإتاحة المواد وحفظ التقدم، وتنفيذ الطلبات والفواتير، والرد على الدعم، وإرسال الإشعارات التشغيلية، وتحسين الأداء، ومنع الاحتيال والاختراق ومخالفة حقوق المحتوى، والوفاء بالمتطلبات النظامية والمحاسبية.</p>
                <p>تستند المعالجة، بحسب الحالة، إلى تنفيذ العقد أو اتخاذ خطوات بطلب المستخدم قبل التعاقد، أو الموافقة عندما تكون مطلوبة، أو الالتزام النظامي، أو المصلحة المشروعة التي لا تتعارض مع حقوق المستخدم. ويمكن سحب الموافقة المتعلقة بالمعالجة الاختيارية من دون أن يؤثر ذلك في مشروعية ما سبق السحب.</p>
              </div>
            </section>

            <section className={styles.section} id="payments">
              <span className={styles.number}>04</span>
              <div>
                <h2>بيانات الدفع والمعاملات</h2>
                <p>تُعالج تفاصيل وسيلة الدفع الحساسة لدى مقدم خدمات دفع مستقل، ولا تخزن المنصة رقم البطاقة الكامل أو رمز التحقق الخاص بها. نحتفظ بالقدر اللازم من مرجع العملية وحالتها ومبلغها ووقتها وبيانات الفاتورة لأغراض تفعيل الخدمة والمطابقة المالية وخدمة المستخدم والالتزام بحفظ السجلات.</p>
              </div>
            </section>

            <section className={styles.section} id="technical-data">
              <span className={styles.number}>05</span>
              <div>
                <h2>ملفات الارتباط والبيانات التقنية</h2>
                <p>تستخدم المنصة ملفات ارتباط وتقنيات تخزين محلية ضرورية لإبقاء الجلسة آمنة، وتذكر إعدادات العرض واللغة، وحفظ السلة والتقدم، وقياس الأعطال والأداء. وقد تتطلب بعض وظائف القياس أو التواصل الاختيارية موافقة مستقلة حيثما يلزم. يمكن تعطيل الملفات غير الضرورية من إعدادات المتصفح أو الجهاز، وقد يؤدي تعطيل الملفات الضرورية إلى تعذر تسجيل الدخول أو إتمام بعض الوظائف.</p>
              </div>
            </section>

            <section className={styles.section} id="providers">
              <span className={styles.number}>06</span>
              <div>
                <h2>مزودو المعالجة التقنية والنقل الخارجي</h2>
                <p>قد نستعين بمزودي معالجة تقنية لاستضافة الخدمة وتخزين الملفات وتشغيل الدفع والإشعارات والبريد والدعم والحماية والنسخ الاحتياطي. يحصل كل مزود على الحد اللازم لأداء مهمته، وتُنظم علاقته بالتزامات تعاقدية وضوابط وصول مناسبة.</p>
                <p>قد تقع بعض مرافق المعالجة أو الدعم خارج المملكة. وعند نقل بيانات شخصية إلى خارجها، نتخذ الخطوات اللازمة للتحقق من وجود أساس نظامي وضمانات مناسبة، وتقليل البيانات، وتقييد الغرض ومدة الاحتفاظ، وفق المتطلبات السارية. ويمكن طلب معلومات عامة عن فئات المزودين والضمانات المستخدمة عبر بريد الدعم، مع مراعاة متطلبات السرية والأمن.</p>
              </div>
            </section>

            <section className={styles.section} id="retention">
              <span className={styles.number}>07</span>
              <div>
                <h2>الاحتفاظ بالبيانات وإتلافها</h2>
                <p>نحتفظ بالبيانات ما دامت لازمة للغرض الذي جُمعت من أجله، بما في ذلك استمرار الحساب أو الصلاحية التعليمية، ثم نحذفها أو نجعلها غير قابلة للارتباط بصاحبها عندما ينتهي الغرض، ما لم يوجب النظام أو نزاع قائم أو حق مشروع الاحتفاظ بها مدة أطول.</p>
                <p>قد تختلف المدد بحسب نوع السجل: تحفظ سجلات المعاملات والفواتير للمدة النظامية، وسجلات الدعم والحماية للمدة اللازمة للتحقق والمتابعة، وقد تبقى نسخة محدودة مؤقتًا ضمن النسخ الاحتياطية الدورية إلى أن تُستبدل وفق دورة النسخ.</p>
              </div>
            </section>

            <section className={styles.section} id="security">
              <span className={styles.number}>08</span>
              <div>
                <h2>حماية البيانات</h2>
                <p>نطبق تدابير تنظيمية وتقنية متناسبة مع طبيعة البيانات والمخاطر، مثل تقييد الصلاحيات، وحماية الاتصال والجلسات، وتسجيل الأحداث الحساسة، والنسخ الاحتياطي، ومراجعة الثغرات والتحديثات. ومع ذلك، لا توجد وسيلة إلكترونية تضمن منع جميع المخاطر، لذلك نطلب استخدام كلمة مرور قوية وعدم مشاركتها والإبلاغ سريعًا عن أي نشاط غير معتاد.</p>
                <p>عند وقوع حادث يمس البيانات، نتخذ إجراءات الاحتواء والتحقيق والإشعار للمستخدم أو الجهة المختصة متى كان الإشعار مطلوبًا نظامًا.</p>
              </div>
            </section>

            <section className={styles.section} id="rights">
              <span className={styles.number}>09</span>
              <div>
                <h2>حقوق صاحب البيانات</h2>
                <p>بحسب الأحكام النظامية السارية، يحق للمستخدم معرفة كيفية معالجة بياناته، والوصول إليها، وطلب نسخة منها بصيغة واضحة، وطلب تصحيح البيانات غير الدقيقة أو استكمالها، وطلب إتلافها عند انتهاء الحاجة النظامية إليها، وسحب الموافقة في المعالجات المبنية عليها، وتقديم شكوى.</p>
                <p>يمكن تقديم الطلب عبر بريد الدعم بعد التحقق من الهوية. وقد نطلب معلومات إضافية لمنع الإفصاح لغير صاحب الصفة، وقد نرفض الطلب أو نقيده في الحالات التي يسمح بها النظام مع بيان السبب وقنوات الاعتراض المتاحة.</p>
              </div>
            </section>

            <section className={styles.section} id="minors">
              <span className={styles.number}>10</span>
              <div>
                <h2>القاصرون وناقصو الأهلية</h2>
                <p>الخدمة موجهة أساسًا لطلاب التعليم بعد الثانوي ومن يملكون أهلية إنشاء الحساب وإتمام الشراء. إذا كان المستخدم دون السن النظامية أو ناقص الأهلية، فيجب أن ينشئ الحساب ويستخدم الخدمة بموافقة وليه أو ممثله النظامي وتحت إشرافه. عند العلم بجمع بيانات قاصر دون سند مناسب، نراجع الحالة ونتخذ الإجراء الملائم، بما في ذلك تقييد الحساب أو إتلاف البيانات عندما يلزم.</p>
              </div>
            </section>

            <section className={styles.section} id="updates">
              <span className={styles.number}>11</span>
              <div>
                <h2>تحديث السياسة</h2>
                <p>قد نحدث هذه السياسة عند تغير الخدمة أو وسائل المعالجة أو المتطلبات النظامية. يظهر تاريخ النفاذ ورقم الإصدار في أعلى الصفحة، ونوفر إشعارًا مناسبًا داخل المنصة أو عبر وسيلة التواصل المسجلة إذا كان التعديل جوهريًا. لا نستخدم التحديث لتوسيع غرض المعالجة على نحو يتطلب موافقة جديدة من دون الحصول عليها.</p>
              </div>
            </section>

            <section className={styles.section} id="complaints">
              <span className={styles.number}>12</span>
              <div>
                <h2>التواصل والشكاوى</h2>
                <p>لطلب ممارسة حق متعلق بالبيانات أو للاستفسار أو الشكوى، تواصل عبر {settings.support_email ? <a className={styles.inlineLink} href={"mailto:" + settings.support_email}>{settings.support_email}</a> : <Link className={styles.inlineLink} href="/support">نموذج الدعم</Link>} مع وصف الطلب وبيانات الحساب اللازمة للتحقق. نؤكد استلام الطلب ونعالجه خلال المدة النظامية أو خلال مدة معقولة بحسب طبيعته، ويمكن تصعيد الشكوى إلى الجهة المختصة وفق القنوات الرسمية إذا لم تُحل.</p>
              </div>
            </section>
          </article>

          <aside className={styles.aside} aria-label="معلومات الوثيقة">
            <section className={styles.toc}>
              <strong className={styles.cardTitle}><FileText size={18} aria-hidden="true" /> في هذه الصفحة</strong>
              <nav aria-label="أقسام سياسة الخصوصية">{sections.map((section) => <a href={"#" + section.id} key={section.id}>{section.title}</a>)}</nav>
            </section>

            <section className={styles.identityCard}>
              <strong className={styles.cardTitle}><Building2 size={18} aria-hidden="true" /> بيانات الجهة المشغلة</strong>
              <div className={styles.identityRows}>
                {identityRows.map((row) => <div key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>)}
                {settings.support_email ? <div><span>بريد الخصوصية والدعم</span><a href={"mailto:" + settings.support_email}><Mail size={13} aria-hidden="true" /> {settings.support_email}</a></div> : <div><span>قناة الخصوصية والدعم</span><Link href="/support">فتح نموذج الدعم</Link></div>}
              </div>
            </section>

            <section className={styles.related}>
              <strong className={styles.cardTitle}><Landmark size={18} aria-hidden="true" /> وثائق مرتبطة</strong>
              <Link href="/terms">الشروط والأحكام <ChevronLeft size={15} aria-hidden="true" /></Link>
              <Link href="/refund-policy">سياسة الاسترداد <ChevronLeft size={15} aria-hidden="true" /></Link>
              <Link href="/support">الدعم والشكاوى <CircleHelp size={15} aria-hidden="true" /></Link>
            </section>
          </aside>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
