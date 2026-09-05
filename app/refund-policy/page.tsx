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
  ReceiptText,
  RotateCcw,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublicSettings } from "@/lib/platform-settings";
import styles from "../legal.module.css";

const EFFECTIVE_DATE = "05 سبتمبر 2026";
const DOCUMENT_VERSION = "1.0";

export const metadata: Metadata = {
  title: "سياسة الاسترداد",
  description: "سياسة طلبات الإلغاء والاسترداد في مراس العلم، وحالات الأهلية وآلية التقديم والمراجعة وإعادة المبلغ.",
  alternates: { canonical: "/refund-policy" },
  openGraph: {
    title: "سياسة الاسترداد | مراس العلم",
    description: "تعرف على حالات وشروط وخطوات طلب الاسترداد في مراس العلم.",
    url: "/refund-policy",
    locale: "ar_SA",
    type: "article",
  },
};

export default async function RefundPolicyPage() {
  const settings = await getPublicSettings();
  const operatorName = settings.legal_name.trim() || "مراس العلم";
  const sections = [
    { id: "scope", title: "نطاق السياسة" },
    { id: "withdrawal", title: "طلب العدول قبل الانتفاع" },
    { id: "eligible", title: "الحالات المؤهلة للاسترداد" },
    { id: "digital-use", title: "بدء الانتفاع بالمحتوى الرقمي" },
    { id: "technical", title: "الأعطال التقنية" },
    { id: "request", title: "طريقة تقديم الطلب" },
    { id: "review", title: "المراجعة والقرار" },
    { id: "amount", title: "احتساب مبلغ الاسترداد" },
    { id: "payment-method", title: "وسيلة ومدة إعادة المبلغ" },
    { id: "subscriptions", title: "الخدمات الدورية والإلغاء" },
    { id: "misuse", title: "الطلبات غير المشروعة والنزاع على الدفع" },
    { id: "complaints", title: "الشكاوى وتحديث السياسة" },
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
            <Link href="/">الرئيسية</Link><ChevronLeft size={13} aria-hidden="true" /><span>سياسة الاسترداد</span>
          </nav>
          <div className={styles.heroGrid}>
            <div>
              <span className={styles.eyebrow}><RotateCcw size={15} aria-hidden="true" /> استرداد واضح وعادل</span>
              <h1>سياسة الاسترداد</h1>
              <p className={styles.lead}>توضح هذه السياسة متى يمكن طلب إلغاء الخدمة أو استرداد المبلغ، وكيف يراجع {operatorName} الطلبات مع مراعاة طبيعة المحتوى الرقمي وحقوق المستهلك.</p>
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
              <ReceiptText aria-hidden="true" />
              <div><strong>قاعدة السياسة</strong>نعيد المبلغ المستحق عندما يثبت حق المستخدم وفق هذه السياسة أو وصف العرض أو الأنظمة السارية. ويُقيّم الانتفاع من المحتوى الرقمي بالاعتماد على سجلات موثوقة، لا بمجرد فتح صفحة الطلب.</div>
            </div>

            <section className={styles.section} id="scope">
              <span className={styles.number}>01</span>
              <div>
                <h2>نطاق السياسة</h2>
                <p>تسري هذه السياسة على الخدمات والمحتوى الرقمي المدفوع الذي يُشترى مباشرة عبر منصة مراس العلم. إذا تم الشراء عبر متجر تطبيقات أو جهة بيع خارجية مستقلة، فقد يلزم تقديم الطلب إليها وفق آليتها، مع تقديم المنصة ما يمكن من معلومات أو دعم.</p>
                <p>تُقرأ هذه السياسة مع تفاصيل المادة الظاهرة قبل الدفع و<Link className={styles.inlineLink} href="/terms">الشروط والأحكام</Link>. وإذا منح وصف العرض مدة أو حقًا أفضل للمستخدم، يطبق الوصف الأفضل على ذلك الطلب.</p>
              </div>
            </section>

            <section className={styles.section} id="withdrawal">
              <span className={styles.number}>02</span>
              <div>
                <h2>طلب العدول قبل الانتفاع</h2>
                <p>مع مراعاة الحقوق والاستثناءات المقررة نظامًا، يمكن للمستخدم طلب العدول خلال سبعة أيام من تاريخ التعاقد إذا لم يستخدم الخدمة أو ينتفع بالمحتوى ولم يتحقق أي سبب يستثني حق العدول. ولا يمنع انتهاء هذه المدة قبول الطلب في حالة أخرى مؤهلة بموجب هذه السياسة أو النظام.</p>
                <p>إذا وافق المستخدم على بدء تقديم المحتوى الرقمي فورًا وبدأ الانتفاع الفعلي به، فقد يتأثر حق العدول بالقدر الذي تجيزه الأنظمة، مع بقاء حقه في حالة العيب أو عدم المطابقة أو تعذر تقديم الخدمة.</p>
              </div>
            </section>

            <section className={styles.section} id="eligible">
              <span className={styles.number}>03</span>
              <div>
                <h2>الحالات المؤهلة للاسترداد</h2>
                <ul>
                  <li>تكرار الخصم عن الطلب نفسه أو تحصيل مبلغ زائد ثبت في سجل الدفع.</li>
                  <li>تأكيد الدفع مع عدم تفعيل الخدمة، وتعذر إصلاح التفعيل خلال مدة معقولة بعد البلاغ.</li>
                  <li>وجود عيب جوهري من المنصة يمنع الانتفاع بالمادة، أو اختلاف جوهري بين الخدمة المسلمة والوصف المعروض وقت الشراء.</li>
                  <li>إلغاء المنصة للمادة المدفوعة قبل إتاحتها أو قبل تمكين المستخدم من الانتفاع الجوهري بها.</li>
                  <li>ثبوت عملية غير مصرح بها بعد إتمام إجراءات التحقق، أو أي حالة أخرى تمنح المستخدم حقًا في الاسترداد نظامًا.</li>
                </ul>
              </div>
            </section>

            <section className={styles.section} id="digital-use">
              <span className={styles.number}>04</span>
              <div>
                <h2>بدء الانتفاع بالمحتوى الرقمي</h2>
                <p>عند تقييم طلب يتعلق بتغيير الرأي أو عدم الحاجة للمادة، يعد من مؤشرات الانتفاع: مشاهدة محتوى مدفوع بعد المعاينة المجانية، أو تنزيل ملف مدفوع، أو إكمال جزء تعليمي، أو استخدام ميزة مرتبطة بالاشتراك. لا يُرفض الطلب آليًا بسبب حدث تقني عابر، بل تراجع مدة الاستخدام وطبيعته وحالة المادة وسبب الطلب مجتمعة.</p>
                <p>لا يمنع الانتفاع من المطالبة بسبب عيب جوهري أو وصف مضلل أو حق لا يجوز إسقاطه نظامًا، وقد يكون الحل إصلاح الخدمة أو استبدالها أو تمديدها أو رد المبلغ كليًا أو جزئيًا بحسب الحالة.</p>
              </div>
            </section>

            <section className={styles.section} id="technical">
              <span className={styles.number}>05</span>
              <div>
                <h2>الأعطال التقنية</h2>
                <p>إذا تعذر تشغيل المحتوى، يجب تحديث التطبيق أو المتصفح والتحقق من الاتصال ثم إرسال بلاغ يتضمن الجهاز ووقت المشكلة وصورة أو وصف الخطأ إن أمكن. يحاول الدعم تشخيص الخلل وإعادة الوصول خلال مدة معقولة. وإذا كان السبب من المنصة واستمر بما يمنع الانتفاع الجوهري، يحق للمستخدم طلب حل بديل مناسب أو الاسترداد.</p>
                <p>لا يشمل ذلك عادةً عطل جهاز المستخدم أو اتصاله، أو عدم توافق جهاز غير مدعوم ومعلن عنه، أو القيود المفروضة بسبب مخالفة موثقة، إلا إذا كان وصف التوافق قبل الشراء غير صحيح.</p>
              </div>
            </section>

            <section className={styles.section} id="request">
              <span className={styles.number}>06</span>
              <div>
                <h2>طريقة تقديم الطلب</h2>
                <p>يُقدم الطلب من صاحب الحساب عبر تذكرة الدعم{settings.support_email ? <>، أو عبر <a className={styles.inlineLink} href={"mailto:" + settings.support_email}>{settings.support_email}</a> إذا تعذر الدخول</> : null}. يجب إرفاق رقم الطلب، والبريد المرتبط بالحساب، وسبب الطلب، ووصف المشكلة، وأي مستند يساعد على التحقق. لا ترسل رقم البطاقة الكامل أو رمز التحقق.</p>
                <p>يُعتد بتاريخ وصول الطلب إلى قناة الدعم المحددة، وقد نطلب إثبات هوية أو ملكية وسيلة الدفع بالقدر اللازم لحماية المستخدم ومنع إعادة المبلغ إلى غير صاحبه.</p>
              </div>
            </section>

            <section className={styles.section} id="review">
              <span className={styles.number}>07</span>
              <div>
                <h2>المراجعة والقرار</h2>
                <p>تراجع المنصة سجل الطلب والدفع والتفعيل والمشاهدة والتنزيل وبلاغات الأعطال والمراسلات ذات الصلة. يصدر القرار دون تأخير غير مبرر وخلال المدة النظامية المطبقة، ويُرسل إلى وسيلة التواصل المسجلة أو يظهر داخل الحساب مع بيان النتيجة وأسباب الرفض عند وقوعه.</p>
                <p>قد يعلق البت مؤقتًا إذا كانت هناك عملية مصرفية معلقة أو معلومات ناقصة أو مطالبة مكررة لدى جهة الدفع، ويُبلغ المستخدم بما يلزم لاستكمال المراجعة.</p>
              </div>
            </section>

            <section className={styles.section} id="amount">
              <span className={styles.number}>08</span>
              <div>
                <h2>احتساب مبلغ الاسترداد</h2>
                <p>عند الموافقة الكاملة، يُرد المبلغ المدفوع فعليًا عن الخدمة المشمولة، بما في ذلك الضريبة المرتبطة به وفق المعالجة النظامية. وإذا كان الحل استردادًا جزئيًا، يوضح للمستخدم أساس الاحتساب قبل التنفيذ متى تطلبت الحالة موافقته.</p>
                <p>لا تُرد كقيمة نقدية مبالغ الخصم أو القسائم أو الهدايا غير المدفوعة نقدًا. وإذا تضمن الطلب أكثر من مادة أو خدمة، يقتصر الاسترداد على الجزء المؤهل. وتخضع إعادة القسيمة أو صلاحيتها لشروطها وحالتها، مع عدم الانتقاص من مبلغ دفعه المستخدم فعليًا ويستحق رده.</p>
              </div>
            </section>

            <section className={styles.section} id="payment-method">
              <span className={styles.number}>09</span>
              <div>
                <h2>وسيلة ومدة إعادة المبلغ</h2>
                <p>بعد الموافقة، تبدأ إعادة المبلغ إلى وسيلة الدفع الأصلية كلما كان ذلك ممكنًا، ولا يُحول إلى حساب شخص آخر. يعتمد وقت ظهور المبلغ بعد إرساله على مقدم خدمات الدفع والبنك ونوع الوسيلة، وقد يظهر كإلغاء للعملية أو كقيد استرداد مستقل.</p>
                <p>إذا تعذرت الإعادة إلى الوسيلة الأصلية، نتواصل مع المستخدم لترتيب وسيلة مشروعة بعد التحقق. ويمكن طلب مرجع الاسترداد من الدعم لمتابعته مع البنك.</p>
              </div>
            </section>

            <section className={styles.section} id="subscriptions">
              <span className={styles.number}>10</span>
              <div>
                <h2>الخدمات الدورية والإلغاء</h2>
                <p>يمكن إيقاف التجديد المستقبلي للخدمة الدورية من القناة المتاحة قبل موعد الخصم. يوقف الإلغاء الخصومات اللاحقة، وتستمر الصلاحية الحالية حتى نهايتها عادةً. لا يعني إيقاف التجديد استرداد الفترة الجارية تلقائيًا، وتُراجع أهليتها وفق هذه السياسة وحقوق المستخدم النظامية.</p>
              </div>
            </section>

            <section className={styles.section} id="misuse">
              <span className={styles.number}>11</span>
              <div>
                <h2>الطلبات غير المشروعة والنزاع على الدفع</h2>
                <p>يجوز رفض طلب يتضمن مستندات مزورة أو إساءة استخدام متكررة أو محاولة تحصيل المبلغ مرتين من المنصة وجهة الدفع، مع الاحتفاظ بحق الاعتراض. إذا فُتح نزاع مصرفي، نتعاون مع الجهة المختصة ونقدم سجلات العملية اللازمة، وقد يعلق الاسترداد المباشر حتى انتهاء النزاع لتجنب الازدواج.</p>
                <p>إذا كانت العملية غير مصرح بها، ينبغي إبلاغ المنصة والبنك فورًا وتغيير بيانات الدخول. لا يُحمّل المستخدم مسؤولية لا يجيزها النظام لمجرد وقوع الاختراق.</p>
              </div>
            </section>

            <section className={styles.section} id="complaints">
              <span className={styles.number}>12</span>
              <div>
                <h2>الشكاوى وتحديث السياسة</h2>
                <p>يمكن الاعتراض على قرار الاسترداد عبر الدعم مع ذكر رقم الطلب وأسباب الاعتراض وأي مستند جديد. تعاد مراجعة القرار من شخص أو مستوى صلاحية مناسب متى أمكن، ويبقى للمستخدم حق اللجوء إلى الجهة الرسمية المختصة.</p>
                <p>قد تُحدث هذه السياسة، ويظهر تاريخ النفاذ ورقم الإصدار في أعلى الصفحة. لا يطبق تعديل لاحق على طلب سابق على نحو ينتقص من حق نشأ وقت الشراء، إلا إذا أوجب النظام خلاف ذلك.</p>
              </div>
            </section>
          </article>

          <aside className={styles.aside} aria-label="معلومات الوثيقة">
            <section className={styles.toc}>
              <strong className={styles.cardTitle}><FileText size={18} aria-hidden="true" /> في هذه الصفحة</strong>
              <nav aria-label="أقسام سياسة الاسترداد">{sections.map((section) => <a href={"#" + section.id} key={section.id}>{section.title}</a>)}</nav>
            </section>

            <section className={styles.identityCard}>
              <strong className={styles.cardTitle}><Building2 size={18} aria-hidden="true" /> بيانات الجهة المشغلة</strong>
              <div className={styles.identityRows}>
                {identityRows.map((row) => <div key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>)}
                {settings.support_email ? <div><span>بريد طلبات الاسترداد</span><a href={"mailto:" + settings.support_email}><Mail size={13} aria-hidden="true" /> {settings.support_email}</a></div> : <div><span>قناة طلبات الاسترداد</span><Link href="/support">فتح تذكرة دعم</Link></div>}
              </div>
            </section>

            <section className={styles.related}>
              <strong className={styles.cardTitle}><Landmark size={18} aria-hidden="true" /> وثائق مرتبطة</strong>
              <Link href="/terms">الشروط والأحكام <ChevronLeft size={15} aria-hidden="true" /></Link>
              <Link href="/privacy">سياسة الخصوصية <ChevronLeft size={15} aria-hidden="true" /></Link>
              <Link href="/support">تقديم طلب أو شكوى <CircleHelp size={15} aria-hidden="true" /></Link>
            </section>
          </aside>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
