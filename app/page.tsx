import Link from "next/link";
import {
  ArrowLeft,
  BookMarked,
  Bot,
  Check,
  CirclePlay,
  FileText,
  GraduationCap,
  Languages,
  ListChecks,
  LockKeyhole,
  MessageSquareText,
  MonitorSmartphone,
  NotebookPen,
  Play,
  ShieldCheck,
  Sparkles,
  TimerReset,
  WalletCards,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HomeGateway } from "@/components/home-gateway";
import { HomeUpcomingTracks } from "@/components/home-upcoming-tracks";
import { HomeFaq } from "@/components/home-faq";
import { UniversityLogo } from "@/components/university-logo";
import { CourseCoverImage } from "@/components/course-cover-image";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
import { getPublicLearningTracks } from "@/lib/learning-tracks";
import type { Course } from "@/lib/data";
import styles from "./home.module.css";

export const revalidate = 60;

const priceFormatter = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 });

function hasReadyPreview(course: Course) {
  return course.units.some((unit) => unit.lessons.some((lesson) => lesson.free && lesson.ready));
}

function uniqueCourses(courses: Course[]) {
  const seen = new Set<string>();
  return courses.filter((course) => {
    if (seen.has(course.slug)) return false;
    seen.add(course.slug);
    return true;
  });
}

export default async function Home() {
  const [institutions, courses, learningTracks] = await Promise.all([
    getInstitutionsCatalog(),
    getCoursesCatalog(),
    getPublicLearningTracks(),
  ]);
  const universityPreview = [...institutions]
    .sort((left, right) => Number(Boolean(right.featured)) - Number(Boolean(left.featured)) || right.courses - left.courses)
    .slice(0, 4);
  const availableCourses = courses.filter((course) => course.availableForPurchase || hasReadyPreview(course));
  const featuredCourses = availableCourses.filter((course) => course.featured);
  const coursePreview = uniqueCourses([...featuredCourses, ...availableCourses, ...courses]).slice(0, 3);
  const searchCourses = courses.map(({ slug, title, titleEn, university, specialty }) => ({ slug, title, titleEn, university, specialty }));
  const searchInstitutions = institutions.map(({ slug, name, nameEn, region, type }) => ({ slug, name, nameEn, region, type }));
  const featured = coursePreview[0];
  const gatewayCourse = featured ? {
    slug: featured.slug,
    title: featured.title,
    university: featured.university,
    specialty: featured.specialty,
    lessons: featured.lessons,
    price: featured.price,
    access: featured.access,
    previewReady: hasReadyPreview(featured),
  } : undefined;

  return (
    <main className={styles.page}>
      <SiteHeader />

      <HomeGateway courses={searchCourses} institutions={searchInstitutions} featuredCourse={gatewayCourse} />

      <section className={styles.signalBar} aria-label="مراس في لمحة">
        <div className={"container " + styles.signalGrid}>
          <article><strong>{institutions.length.toLocaleString("ar-SA")}</strong><span>جامعة في الكتالوج</span></article>
          <i aria-hidden="true" />
          <article><strong>{availableCourses.length.toLocaleString("ar-SA")}</strong><span>مادة متاحة أو لها تجربة</span></article>
          <i aria-hidden="true" />
          <article><MonitorSmartphone size={20} /><span>تقدّم واحد على الويب والتطبيق</span></article>
        </div>
      </section>

      <section className={styles.discovery} id="explore" aria-labelledby="discovery-title" data-home-reveal>
        <div className="container">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.kicker}>استكشف المحتوى</span>
              <h2 id="discovery-title">اختر جامعتك، ثم ابدأ من المادة.</h2>
            </div>
            <div>
              <p>كل بطاقة تقود إلى معلومات فعلية: حالة التوفر، الدرس التجريبي إن وجد، السعر والتخصص قبل الاشتراك.</p>
              <Link href="/courses">جميع المواد <ArrowLeft size={16} /></Link>
            </div>
          </header>

          <div className={styles.discoveryLayout}>
            <aside className={styles.universityPanel} aria-label="جامعات مميزة">
              <header><span><GraduationCap size={17} /> ابدأ من الجامعة</span><Link href="/universities">عرض الكل</Link></header>
              <div>
                {universityPreview.map((institution, index) => (
                  <Link key={institution.slug} href={"/universities/" + institution.slug} className={styles.universityRow}>
                    <em>{String(index + 1).padStart(2, "0")}</em>
                    <span className={styles.universityLogo}><UniversityLogo institution={institution} /></span>
                    <span><strong>{institution.name}</strong><small><bdi dir="ltr">{institution.nameEn}</bdi></small></span>
                    <ArrowLeft size={16} />
                  </Link>
                ))}
              </div>
              <Link className={styles.panelAction} href="/universities">اختر جامعتك وتخصصك <ArrowLeft size={16} /></Link>
            </aside>

            <div className={styles.coursePanel}>
              <div className={styles.panelTitle}><span><BookMarked size={17} /> مواد للبدء الآن</span><small>بيانات حقيقية من الكتالوج</small></div>
              <div className={styles.courseGrid}>
                {coursePreview.map((course) => {
                  const previewReady = hasReadyPreview(course);
                  return (
                    <Link key={course.slug} href={"/courses/" + course.slug} className={styles.courseCard}>
                      <span className={styles.courseMedia}>
                        {course.coverImage ? <CourseCoverImage className={styles.courseImage} src={course.coverImage} alt="" sizes="(max-width: 700px) 86vw, (max-width: 1100px) 42vw, 24vw" /> : <b>{course.icon}</b>}
                        <em>{previewReady ? <><CirclePlay size={13} /> درس تجريبي</> : course.availableForPurchase ? "متاحة الآن" : "قيد الإعداد"}</em>
                      </span>
                      <span className={styles.courseBody}>
                        <small>{course.university} · {course.specialty}</small>
                        <strong>{course.title}</strong>
                        <bdi dir="ltr">{course.titleEn}{course.code ? " · " + course.code : ""}</bdi>
                        <span className={styles.courseMeta}><i>{course.lessons.toLocaleString("ar-SA")} درسًا</i><i>{course.duration}</i></span>
                        <span className={styles.courseFooter}>
                          <span>{course.price > 0 ? <><b>{priceFormatter.format(course.price)}</b> ر.س</> : <b>مجاني</b>}{course.oldPrice ? <del>{priceFormatter.format(course.oldPrice)}</del> : null}</span>
                          <em>عرض المادة <ArrowLeft size={15} /></em>
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.journey} id="journey" aria-labelledby="journey-title" data-home-reveal>
        <div className={"container " + styles.journeyShell}>
          <header>
            <span className={styles.kicker}>رحلة تعلّم واحدة</span>
            <h2 id="journey-title">من أول معاينة<br />إلى آخر ثانية شاهدتها.</h2>
            <p>صممنا الرحلة لتبقى واضحة، ويظل تقدمك وملاحظاتك في مكانهما كلما رجعت.</p>
          </header>
          <div className={styles.journeySteps}>
            <span className={styles.journeyThread} aria-hidden="true"><i /></span>
            <article><b>01</b><i><Play size={18} /></i><div><h3>جرّب قبل الاشتراك</h3><p>افتح الدرس التجريبي إن كان متاحًا وتعرّف إلى أسلوب الشرح.</p></div></article>
            <article><b>02</b><i><BookMarked size={18} /></i><div><h3>ابدأ من خطتك</h3><p>اختر المادة والوحدة، ثم تابع بترتيب يناسب وقتك.</p></div></article>
            <article><b>03</b><i><NotebookPen size={18} /></i><div><h3>ثبّت الفكرة في لحظتها</h3><p>أضف ملاحظة مرتبطة بوقت الفيديو وارجع إليها مباشرة.</p></div></article>
            <article><b>04</b><i><TimerReset size={18} /></i><div><h3>ارجع دون أن تبدأ من جديد</h3><p>يحفظ الحساب تقدمك لتكمل من موضعك على أجهزتك.</p></div></article>
          </div>
        </div>
      </section>

      <section className={styles.aiSection} id="ai" aria-labelledby="ai-title" data-home-reveal>
        <div className={"container " + styles.aiShell}>
          <div className={styles.aiCopy}>
            <span className={styles.aiKicker}><Sparkles size={15} /> مراس AI</span>
            <h2 id="ai-title">ملف مزدحم.<br /><em>جلسة مذاكرة واضحة.</em></h2>
            <p>ارفع ملفًا مدعومًا، ثم اختر تلخيصه، أو ترجمته عربيًا وإنجليزيًا، أو تحويله إلى أسئلة تفاعلية مع شرح الإجابات.</p>
            <div className={styles.aiFeatures}>
              <span><FileText size={16} /> تلخيص منظم</span>
              <span><Languages size={16} /> ترجمة للمحتوى</span>
              <span><ListChecks size={16} /> أسئلة مع شرح</span>
              <span><MessageSquareText size={16} /> سجل محفوظ</span>
            </div>
            <Link href="/meras-ai">افتح مراس AI <ArrowLeft size={17} /></Link>
            <small>تختلف الخدمات وحدود الاستخدام حسب حالة الحساب وإعدادات الإدارة.</small>
          </div>

          <div className={styles.aiDemo} aria-label="مثال توضيحي لمساحة مراس AI">
            <header><span><Bot size={17} /> مساحة العمل</span><small><i /> مثال توضيحي</small></header>
            <div className={styles.aiInput}>
              <span><FileText size={19} /></span>
              <div><strong>ملف المحاضرة.pdf</strong><small>جاهز لاختيار طريقة المذاكرة</small></div>
              <Check size={16} />
            </div>
            <div className={styles.aiOutput}>
              <small>اختر ناتجًا</small>
              <article><i>أ</i><div><strong>ملخص مركّز</strong><span>الأفكار والعلاقات الرئيسية</span></div><ArrowLeft size={15} /></article>
              <article><i>EN</i><div><strong>ترجمة ثنائية</strong><span>النص والمصطلحات في سياقها</span></div><ArrowLeft size={15} /></article>
              <article><i>?</i><div><strong>اختبار تفاعلي</strong><span>بطاقات وأسئلة وشرح للإجابة</span></div><ArrowLeft size={15} /></article>
            </div>
            <div className={styles.aiPrompt}><span>اسأل عن الملف أو اطلب شرحًا أبسط…</span><ArrowLeft size={15} /></div>
          </div>
        </div>
      </section>

      <HomeUpcomingTracks tracks={learningTracks} />

      <section className={styles.payment} id="payment" aria-labelledby="payment-title" data-home-reveal>
        <div className={"container " + styles.paymentShell}>
          <div><span className={styles.kicker}>الدفع</span><h2 id="payment-title">طريقة واضحة، وخيارات تظهر حسب أهليتك.</h2></div>
          <p>يتم الدفع عبر صفحة Tap الآمنة، وقد تظهر تابي وتمارا بحسب قيمة الطلب وأهلية الخدمة وإعدادات مزود الدفع.</p>
          <div className={styles.providers}>
            <span><b dir="ltr">tap</b><small>بوابة الدفع</small></span>
            <span><b>تابي</b><small>عند الأهلية</small></span>
            <span><b>تمارا</b><small>عند الأهلية</small></span>
          </div>
          <footer>
            <span><ShieldCheck size={16} /> تحقق من الخادم</span>
            <span><LockKeyhole size={16} /> لا نخزن بيانات البطاقة</span>
            <span><WalletCards size={16} /> خيارات المزود تظهر قبل التأكيد</span>
          </footer>
        </div>
      </section>

      <section className={styles.request} id="request" data-home-reveal>
        <div className={"container " + styles.requestShell}>
          <span className={styles.requestMark} aria-hidden="true">✦</span>
          <div><small>مراس تنمو مع احتياجك</small><h2>مادتك أو فكرتك غير موجودة؟</h2><p>أرسل الجامعة والتخصص واسم المادة أو المسار الذي تحتاجه، وأرفق الملفات المتاحة إن وجدت.</p></div>
          <div><Link href="/request-course">أرسل طلبك <ArrowLeft size={17} /></Link><Link href="/courses">تصفح جميع المواد</Link></div>
        </div>
      </section>

      <HomeFaq title="كل ما تحتاجه قبل الاشتراك" />

      <SiteFooter />
    </main>
  );
}
