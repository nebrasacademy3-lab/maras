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
  Scale,
  ScrollText,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublicSettings } from "@/lib/platform-settings";
import styles from "../legal.module.css";

const EFFECTIVE_DATE = "05 سبتمبر 2026";
const DOCUMENT_VERSION = "1.0";

export const metadata: Metadata = {
  title: "الشروط والأحكام",
  description: "الشروط المنظمة لاستخدام منصة مراس العلم والحسابات وشراء المحتوى التعليمي والدفع وحقوق المحتوى والشكاوى.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "الشروط والأحكام | مراس العلم",
    description: "الشروط المنظمة للحساب والشراء والوصول إلى المحتوى في مراس العلم.",
    url: "/terms",
    locale: "ar_SA",
    type: "article",
  },
};

export default async function TermsPage() {
  const settings = await getPublicSettings();
  const operatorName = settings.legal_name.trim() || "مراس العلم";
  const sections = [
    { id: "scope", title: "التعريف ونطاق الاتفاق" },
    { id: "eligibility", title: "الأهلية وإنشاء الحساب" },
    { id: "service", title: "طبيعة الخدمة التعليمية" },
    { id: "orders", title: "الطلبات والأسعار والدفع" },
    { id: "access", title: "الصلاحية والاشتراكات" },
    { id: "acceptable-use", title: "الاستخدام المقبول" },
    { id: "content-rights", title: "حقوق المحتوى والملكية الفكرية" },
    { id: "user-content", title: "محتوى المستخدم والملفات" },
    { id: "communications", title: "الإشعارات والتواصل" },
    { id: "availability", title: "التوفر والتعليق وإنهاء الحساب" },
    { id: "third-parties", title: "الخدمات والروابط الخارجية" },
    { id: "refunds", title: "الإلغاء والاسترداد" },
    { id: "responsibility", title: "المسؤولية والحقوق النظامية" },
    { id: "changes", title: "تعديل الشروط" },
    { id: "law", title: "النظام الواجب والتواصل والشكاوى" },
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
            <Link href="/">الرئيسية</Link><ChevronLeft size={13} aria-hidden="true" /><span>الشروط والأحكام</span>
          </nav>
          <div className={styles.heroGrid}>
            <div>
              <span className={styles.eyebrow}><Scale size={15} aria-hidden="true" /> اتفاق استخدام الخدمة</span>
              <h1>الشروط والأحكام</h1>
              <p className={styles.lead}>تنظم هذه الشروط العلاقة بين {operatorName} والمستخدم عند إنشاء الحساب أو تصفح المحتوى أو شراء خدمة تعليمية عبر الموقع أو التطبيقات.</p>
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
              <ScrollText aria-hidden="true" />
              <div><strong>قبل استخدام الخدمة</strong>يرجى قراءة هذه الشروط وسياسة الخصوصية وسياسة الاسترداد. إنشاء الحساب أو إتمام الطلب يعني قبول الشروط السارية وقت الاستخدام أو الشراء، ولا ينتقص ذلك من أي حق لا يجوز التنازل عنه نظامًا.</div>
            </div>

            <section className={styles.section} id="scope">
              <span className={styles.number}>01</span>
              <div>
                <h2>التعريف ونطاق الاتفاق</h2>
                <p>يقصد بـ«المنصة» موقع مراس العلم وتطبيقاته وخدماته المرتبطة، وبـ«المستخدم» كل من يتصفحها أو ينشئ حسابًا فيها، وبـ«المادة» المحتوى أو الخدمة التعليمية المعروضة. تشكل هذه الشروط مع تفاصيل المادة والطلب وسياسة الخصوصية وسياسة الاسترداد الاتفاق المنظم للاستخدام.</p>
                <p>إذا تعارض وصف خاص ظاهر بوضوح في صفحة المادة أو الطلب مع حكم عام هنا، فيطبق الوصف الخاص على تلك المعاملة في حدود ما لا يخالف الأنظمة السارية.</p>
              </div>
            </section>

            <section className={styles.section} id="eligibility">
              <span className={styles.number}>02</span>
              <div>
                <h2>الأهلية وإنشاء الحساب</h2>
                <ul>
                  <li>يجب تقديم بيانات صحيحة ومحدثة وعدم انتحال صفة شخص آخر.</li>
                  <li>الحساب شخصي، ويلتزم المستخدم بحماية كلمة المرور ورموز التحقق وعدم مشاركة الجلسة مع الغير.</li>
                  <li>يجب إبلاغ الدعم فور الاشتباه في استخدام غير مصرح به، وتحديث بيانات التواصل حتى تصل الإشعارات المرتبطة بالخدمة.</li>
                  <li>يستخدم القاصر أو ناقص الأهلية المنصة بموافقة وليه أو ممثله النظامي وتحت إشرافه، ويتحمل الممثل النظامي مسؤولية المشتريات المصرح بها.</li>
                </ul>
                <p>يجوز طلب تحقق إضافي عند وجود مؤشرات احتيال أو نزاع على الملكية أو الدفع، بما يقتصر على القدر اللازم للتحقق.</p>
              </div>
            </section>

            <section className={styles.section} id="service">
              <span className={styles.number}>03</span>
              <div>
                <h2>طبيعة الخدمة التعليمية</h2>
                <p>توفر المنصة شروحات ومواد تعلم مساندة مرتبطة بمقررات أو مهارات محددة. يظهر قبل الشراء وصف المادة ومحتوياتها ومدتها المتاحة وسعرها وأي درس تجريبي. لا تمثل المواد جهة الجامعة، ولا تُعد بديلًا عن المصادر الرسمية أو اللوائح والخطط الأكاديمية الصادرة منها، ما لم يذكر خلاف ذلك بمستند صريح.</p>
                <p>تبذل المنصة عناية معقولة في إعداد المحتوى وتحديثه، لكنها لا تضمن درجة أو نتيجة دراسية بعينها؛ فالنتيجة تعتمد أيضًا على التزام الطالب ومتطلبات الجهة التعليمية وتغير المنهج. ويتعين الرجوع إلى الجهة التعليمية عند التعارض مع معلومة رسمية حديثة.</p>
              </div>
            </section>

            <section className={styles.section} id="orders">
              <span className={styles.number}>04</span>
              <div>
                <h2>الطلبات والأسعار والدفع</h2>
                <ul>
                  <li>يعرض ملخص الطلب اسم الخدمة والسعر والخصم والضريبة إن وجدت والإجمالي ومدة الوصول قبل تأكيد الدفع.</li>
                  <li>لا تعد العملية مكتملة ولا تُفعّل الصلاحية إلا بعد ورود تأكيد موثوق من مقدم خدمات الدفع وقبول الطلب في المنصة.</li>
                  <li>قد تُرفض العملية أو تُلغى قبل التفعيل إذا تعذر التحقق منها أو كان السعر ظاهرًا بخطأ مادي واضح، مع إعادة أي مبلغ محصل وفق وسيلة الدفع.</li>
                  <li>تصدر الفاتورة أو إيصال العملية بالبيانات المتاحة نظامًا، ويتحمل المستخدم صحة بيانات الفوترة التي يقدمها.</li>
                </ul>
                <p>تخضع القسائم والعروض لشروطها الظاهرة، بما في ذلك مدة الصلاحية والمستخدم أو المواد المشمولة وعدم الجمع بينها، ولا تتحول قيمتها إلى نقد إلا إذا أوجب النظام خلاف ذلك.</p>
              </div>
            </section>

            <section className={styles.section} id="access">
              <span className={styles.number}>05</span>
              <div>
                <h2>الصلاحية والاشتراكات</h2>
                <p>تبدأ صلاحية المادة بعد تأكيد الطلب، وتستمر للمدة المبينة قبل الشراء ما لم تُمدد كتابةً أو يوجب النظام خلاف ذلك. الوصول ترخيص شخصي محدود وغير قابل للنقل أو إعادة البيع. وقد تطبق حدود معقولة على عدد الأجهزة أو الجلسات لحماية الحساب والمحتوى، على أن تظهر للمستخدم أو يُبلغ بها.</p>
                <p>إذا كانت خدمة ما دورية التجديد، فيظهر تكرار الخصم وسعره وطريقة الإلغاء قبل الموافقة. إلغاء التجديد يمنع الخصم المستقبلي ولا يزيل عادةً الصلاحية المدفوعة المتبقية، ما لم ينص وصف الخدمة على غير ذلك.</p>
              </div>
            </section>

            <section className={styles.section} id="acceptable-use">
              <span className={styles.number}>06</span>
              <div>
                <h2>الاستخدام المقبول</h2>
                <p>يلتزم المستخدم باستعمال المنصة للأغراض التعليمية المشروعة. ويُحظر مشاركة الحساب، أو تسجيل الشاشة أو البث أو النسخ أو الاستخراج الآلي، أو التحايل على حدود الوصول والعلامة المائية، أو اختبار الحماية دون تصريح، أو رفع ملفات ضارة، أو الإساءة للآخرين، أو استخدام بيانات أو وسائل دفع لا يملك المستخدم حق استعمالها.</p>
                <p>لا يجوز استخدام المنصة بما يعطلها أو يضر مستخدميها أو ينتهك أنظمة المملكة أو حقوق الملكية الفكرية أو الخصوصية. ويجوز فرض حدود فنية متناسبة لمنع إساءة الاستخدام مع مراعاة الوصول المشروع للمستخدم.</p>
              </div>
            </section>

            <section className={styles.section} id="content-rights">
              <span className={styles.number}>07</span>
              <div>
                <h2>حقوق المحتوى والملكية الفكرية</h2>
                <p>تعود ملكية المنصة وعناصرها ومحتواها الأصلي إلى أصحاب الحقوق أو الجهات المرخصة، بما يشمل الفيديو والملفات والنصوص والتصميم والعلامات. شراء المادة لا ينقل ملكيتها؛ بل يمنح المستخدم حقًا شخصيًا مؤقتًا للمشاهدة أو الاستخدام داخل النطاق المبين.</p>
                <p>لا يجوز إعادة نشر المحتوى أو توزيعه أو بيعه أو إتاحته للغير أو إزالة إشعارات الحقوق. ويمكن إرسال بلاغ حقوق عبر الدعم مرفقًا بوصف العمل والرابط وما يثبت الصفة، وتراجع المنصة البلاغ وتتخذ الإجراء المناسب.</p>
              </div>
            </section>

            <section className={styles.section} id="user-content">
              <span className={styles.number}>08</span>
              <div>
                <h2>محتوى المستخدم والملفات</h2>
                <p>يظل المستخدم مسؤولًا عن الملفات والملاحظات والتقييمات والطلبات التي يرفعها، ويقر بأن لديه حق إرسالها وأنها لا تنتهك خصوصية الغير أو حقوقهم. يمنح المستخدم المنصة إذنًا محدودًا بمعالجة هذا المحتوى بالقدر اللازم لتقديم الخدمة والمراجعة والدعم والحماية، ولا يعني ذلك نقل ملكيته.</p>
                <p>يجوز حذف أو تقييد المحتوى المخالف أو الخطر بعد التحقق المناسب، وقد تُحفظ نسخة بالقدر والمدة اللازمين لإثبات المخالفة أو تنفيذ التزام نظامي.</p>
              </div>
            </section>

            <section className={styles.section} id="communications">
              <span className={styles.number}>09</span>
              <div>
                <h2>الإشعارات والتواصل</h2>
                <p>قد ترسل المنصة إشعارات لازمة لتشغيل الحساب، مثل تأكيد الطلب وتغير الصلاحية والتنبيه الأمني ورد الدعم وتحديث جوهري للخدمة. وقد تُرسل رسائل تسويقية عند وجود أساس مناسب، ويمكن إيقافها من القناة المتاحة من دون أن يؤثر ذلك في الرسائل التشغيلية الضرورية.</p>
                <p>تعد الرسالة المرسلة إلى وسيلة التواصل المسجلة مستلمة في الظروف المعتادة، لذلك يجب إبقاء البيانات محدثة ومراجعة صندوق الرسائل غير المرغوبة.</p>
              </div>
            </section>

            <section className={styles.section} id="availability">
              <span className={styles.number}>10</span>
              <div>
                <h2>التوفر والتعليق وإنهاء الحساب</h2>
                <p>نعمل على توفير الخدمة بصورة مستقرة، وقد تقع صيانة أو أعطال أو ظروف خارجة عن السيطرة. نسعى للإشعار بالصيانة المخططة متى أمكن ومعالجة الخلل خلال مدة معقولة. إذا أثر خلل من المنصة جوهريًا في خدمة مدفوعة، تطبق الحلول الموضحة في سياسة الاسترداد أو أي حق نظامي أقوى.</p>
                <p>يجوز تقييد الحساب مؤقتًا لحمايته أو للتحقيق في مخالفة أو مطالبة دفع، ويجوز إنهاؤه عند مخالفة جوهرية أو متكررة بعد مراعاة طبيعة المخالفة وإتاحة وسيلة للاعتراض متى كان ذلك مناسبًا. لا يسقط الإنهاء الالتزامات أو الحقوق التي نشأت قبله.</p>
              </div>
            </section>

            <section className={styles.section} id="third-parties">
              <span className={styles.number}>11</span>
              <div>
                <h2>الخدمات والروابط الخارجية</h2>
                <p>قد تعتمد بعض الوظائف على مزودي معالجة تقنية مستقلين، مثل الدفع والاستضافة والإشعارات، أو تتضمن روابط لمواقع أخرى. يخضع استخدام الخدمة الخارجية لشروط مقدمها وسياساته عندما يتعامل المستخدم معها مباشرة، ولا تتحمل المنصة ممارسات جهة خارجية لا تخضع لإدارتها، مع بقاء مسؤوليتها عما لا يجوز استبعاده نظامًا.</p>
              </div>
            </section>

            <section className={styles.section} id="refunds">
              <span className={styles.number}>12</span>
              <div>
                <h2>الإلغاء والاسترداد</h2>
                <p>تخضع طلبات الإلغاء والاسترداد إلى <Link className={styles.inlineLink} href="/refund-policy">سياسة الاسترداد</Link> السارية وقت الشراء، وإلى وصف العرض وأي حقوق مقررة نظامًا. يجب تقديم الطلب من الحساب أو عبر الدعم مع رقم الطلب والسبب، ويجري رد المبلغ المستحق إلى وسيلة الدفع الأصلية ما لم يتفق على وسيلة مشروعة أخرى.</p>
              </div>
            </section>

            <section className={styles.section} id="responsibility">
              <span className={styles.number}>13</span>
              <div>
                <h2>المسؤولية والحقوق النظامية</h2>
                <p>لا تستبعد هذه الشروط مسؤولية لا يجوز استبعادها، ولا تنتقص من حقوق المستهلك أو صاحب البيانات المقررة نظامًا. وفي الحدود التي يسمح بها النظام، لا تكون المنصة مسؤولة عن خسارة غير مباشرة أو نتيجة ناشئة عن سوء استخدام الحساب، أو مخالفة التعليمات، أو قرار أكاديمي اتخذه المستخدم اعتمادًا على المحتوى دون الرجوع للمصدر الرسمي.</p>
                <p>يقتصر أي تقييد للمسؤولية على الحد المسموح به وبما يتناسب مع طبيعة الضرر المباشر المثبت، ولا يسري على الغش أو الخطأ الجسيم أو الحالات التي يقرر النظام خلاف ذلك.</p>
              </div>
            </section>

            <section className={styles.section} id="changes">
              <span className={styles.number}>14</span>
              <div>
                <h2>تعديل الشروط</h2>
                <p>قد تُحدث الشروط عند إضافة خدمات أو تغير المتطلبات النظامية. يظهر تاريخ النفاذ ورقم الإصدار في أعلى الصفحة، ويقدم إشعار مناسب عند التعديل الجوهري. لا يطبق تعديل لاحق بأثر رجعي على معاملة مكتملة بما يخل بحق مكتسب، إلا إذا كان التعديل مطلوبًا نظامًا أو وافق عليه المستخدم على نحو صحيح.</p>
              </div>
            </section>

            <section className={styles.section} id="law">
              <span className={styles.number}>15</span>
              <div>
                <h2>النظام الواجب والتواصل والشكاوى</h2>
                <p>تخضع هذه الشروط لأنظمة المملكة العربية السعودية. يسعى الطرفان أولًا إلى حل النزاع وديًا عبر الدعم، ولا يمنع ذلك المستخدم من اللجوء إلى الجهة الرسمية أو القضائية المختصة. للاستفسار أو الشكوى، أرسل رقم الحساب أو الطلب ووصف المشكلة عبر {settings.support_email ? <a className={styles.inlineLink} href={"mailto:" + settings.support_email}>{settings.support_email}</a> : <Link className={styles.inlineLink} href="/support">نموذج الدعم</Link>} من دون إرسال كلمة المرور أو بيانات البطاقة.</p>
              </div>
            </section>
          </article>

          <aside className={styles.aside} aria-label="معلومات الوثيقة">
            <section className={styles.toc}>
              <strong className={styles.cardTitle}><FileText size={18} aria-hidden="true" /> في هذه الصفحة</strong>
              <nav aria-label="أقسام الشروط والأحكام">{sections.map((section) => <a href={"#" + section.id} key={section.id}>{section.title}</a>)}</nav>
            </section>

            <section className={styles.identityCard}>
              <strong className={styles.cardTitle}><Building2 size={18} aria-hidden="true" /> بيانات الجهة المشغلة</strong>
              <div className={styles.identityRows}>
                {identityRows.map((row) => <div key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>)}
                {settings.support_email ? <div><span>بريد الدعم والشكاوى</span><a href={"mailto:" + settings.support_email}><Mail size={13} aria-hidden="true" /> {settings.support_email}</a></div> : <div><span>قناة الدعم والشكاوى</span><Link href="/support">فتح نموذج الدعم</Link></div>}
              </div>
            </section>

            <section className={styles.related}>
              <strong className={styles.cardTitle}><Landmark size={18} aria-hidden="true" /> وثائق مرتبطة</strong>
              <Link href="/privacy">سياسة الخصوصية <ChevronLeft size={15} aria-hidden="true" /></Link>
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
