import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  BookMarked,
  Bot,
  Check,
  CirclePlay,
  Clock3,
  FileText,
  GraduationCap,
  Languages,
  ListChecks,
  LockKeyhole,
  MessageSquareText,
  MonitorSmartphone,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  TimerReset,
  WalletCards,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroSearch } from "@/components/hero-search";
import { BrandMark } from "@/components/brand-mark";
import { UniversityLogo } from "@/components/university-logo";
import { CourseCoverImage } from "@/components/course-cover-image";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
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
  const [institutions, courses] = await Promise.all([getInstitutionsCatalog(), getCoursesCatalog()]);
  const universityPreview = [...institutions]
    .sort((left, right) => Number(Boolean(right.featured)) - Number(Boolean(left.featured)) || right.courses - left.courses)
    .slice(0, 4);
  const readyFeatured = courses.filter((course) => course.featured && (course.availableForPurchase || hasReadyPreview(course)));
  const readyOthers = courses.filter((course) => !course.featured && (course.availableForPurchase || hasReadyPreview(course)));
  const coursePreview = uniqueCourses([...readyFeatured, ...readyOthers, ...courses]).slice(0, 3);
  const searchCourses = courses.map(({ slug, title, titleEn, university, specialty }) => ({ slug, title, titleEn, university, specialty }));
  const searchInstitutions = institutions.map(({ slug, name, nameEn, region, type }) => ({ slug, name, nameEn, region, type }));

  return (
    <main className={styles.page}>
      <SiteHeader />

      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroGridPattern} aria-hidden="true" />
        <div className={styles.heroAurora} aria-hidden="true" />
        <div className={"container " + styles.heroLayout}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><i /> تجربة تعلم جامعية، بُنيت بالعربية</span>
            <h1 id="home-title">كل ما تحتاجه<br /><span>لفهم مقرراتك.</span></h1>
            <p>مواد مرتبة حسب جامعتك، تجربة مشاهدة تحفظ تقدّمك، ومراس AI يحوّل ملفاتك إلى مذاكرة أوضح—كلها في مكان واحد.</p>

            <div className={styles.searchShell}>
              <HeroSearch courses={searchCourses} institutions={searchInstitutions} />
            </div>

            <div className={styles.heroLinks}>
              <Link href="/courses" className={styles.primaryLink}>استكشف جميع المواد <ArrowLeft size={18} /></Link>
              <Link href="/meras-ai" className={styles.secondaryLink}><Sparkles size={17} /> اكتشف مراس AI</Link>
            </div>

            <div className={styles.heroAssurances} aria-label="مزايا المنصة">
              <span><CirclePlay size={17} /> جرّب قبل الاشتراك</span>
              <span><TimerReset size={17} /> أكمل من نفس اللحظة</span>
              <span><ShieldCheck size={17} /> دفع وتفعيل آمن</span>
            </div>
          </div>

          <div className={styles.heroStage} role="img" aria-label="معاينة لتجربة الدرس والملاحظات ومراس AI داخل المنصة">
            <div className={styles.stageHalo} aria-hidden="true" />
            <div className={styles.workspace} aria-hidden="true">
              <header className={styles.workspaceHeader}>
                <div className={styles.workspaceBrand}><BrandMark /><span><small>مراس العلم</small><strong>مساحة التعلّم</strong></span></div>
                <div className={styles.windowDots}><i /><i /><i /></div>
                <span className={styles.livePill}><i /> درس تجريبي</span>
              </header>

              <div className={styles.workspaceBody}>
                <aside className={styles.lessonRail}>
                  <div><small>هياكل البيانات</small><strong>الوحدة الأولى</strong></div>
                  <span className={styles.lessonDone}><Check size={13} /> مقدمة المقرر</span>
                  <span className={styles.lessonActive}><CirclePlay size={13} /> القوائم المتصلة</span>
                  <span><Clock3 size={13} /> المكدسات والطوابير</span>
                  <span><LockKeyhole size={13} /> الأشجار الثنائية</span>
                </aside>

                <div className={styles.playerPanel}>
                  <div className={styles.playerTop}><span>الدرس 03 · القوائم المتصلة</span><b>18:32</b></div>
                  <div className={styles.playerCanvas}>
                    <div className={styles.dataNodes}><i>01</i><span /><i>02</i><span /><i>03</i></div>
                    <div className={styles.playDisc}><BookMarked size={25} /></div>
                    <span className={styles.noteMarker}><NotebookPen size={12} /> ملاحظة</span>
                  </div>
                  <div className={styles.timeline}><i><b /></i><span>18:32</span><span>31:44</span></div>
                </div>
              </div>

              <footer className={styles.workspaceFooter}>
                <div><NotebookPen size={17} /><span><small>ملاحظة عند 18:32</small><strong>راجع الفرق بين العقدة والرابط</strong></span></div>
                <div><Sparkles size={17} /><span><small>مراس AI</small><strong>لخّص لي هذه الجزئية</strong></span><ArrowLeft size={15} /></div>
              </footer>
            </div>
            <div className={styles.stageBadge}><BadgeCheck size={18} /><span><strong>تقدّمك محفوظ</strong><small>على الويب والتطبيق</small></span></div>
          </div>
        </div>
      </section>

      <section className={styles.proofStrip} aria-label="لماذا مراس">
        <div className={"container " + styles.proofGrid}>
          <article><i><GraduationCap size={21} /></i><span><strong>مصمم لمسارك الجامعي</strong><small>جامعة، تخصص، ثم المادة التي تحتاجها.</small></span></article>
          <article><i><NotebookPen size={21} /></i><span><strong>تعلم لا يضيع منك</strong><small>تقدّم وملاحظات مرتبطة بوقت الفيديو.</small></span></article>
          <article><i><MonitorSmartphone size={21} /></i><span><strong>تجربة متصلة</strong><small>ابدأ من الويب وأكمل من التطبيق.</small></span></article>
        </div>
      </section>

      <section className={styles.discovery} id="discover" aria-labelledby="discovery-title" data-home-reveal>
        <div className="container">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionKicker}>ابدأ من مسارك</span>
              <h2 id="discovery-title">ابحث أقل. ابدأ أسرع.</h2>
              <p>اختر جامعتك أو افتح مادة جاهزة، وستجد التفاصيل والدرس التجريبي قبل أي قرار.</p>
            </div>
            <Link href="/courses" className={styles.textLink}>عرض جميع المواد <ArrowLeft size={17} /></Link>
          </header>

          <div className={styles.discoveryGrid}>
            <aside className={styles.universityPanel} aria-label="جامعات مميزة">
              <div className={styles.panelHeading}><span><GraduationCap size={18} /> جامعات مميزة</span><Link href="/universities">عرض الكل</Link></div>
              <div className={styles.universityList}>
                {universityPreview.map((institution) => (
                  <Link key={institution.slug} href={"/universities/" + institution.slug} className={styles.universityRow}>
                    <span className={styles.universityLogo}><UniversityLogo institution={institution} /></span>
                    <span><strong>{institution.name}</strong><small><bdi dir="ltr">{institution.nameEn}</bdi></small></span>
                    <ArrowLeft size={17} />
                  </Link>
                ))}
              </div>
              <Link href="/universities" className={styles.panelAction}>اختر جامعتك <ArrowLeft size={17} /></Link>
            </aside>

            <div className={styles.coursePanel}>
              <div className={styles.panelHeading}><span><BookMarked size={18} /> مواد مختارة للبدء</span><small>معلومات واضحة قبل الاشتراك</small></div>
              <div className={styles.courseGrid}>
                {coursePreview.map((course) => {
                  const previewReady = hasReadyPreview(course);
                  return (
                    <Link key={course.slug} href={"/courses/" + course.slug} className={styles.courseCard}>
                      <span className={styles.courseMedia + " bg-gradient-to-br " + course.color}>
                        <span className={styles.courseOverlay} />
                        {course.coverImage ? <CourseCoverImage className={styles.courseImage} src={course.coverImage} alt="" sizes="(max-width: 680px) 92vw, (max-width: 1100px) 44vw, 24vw" /> : <b>{course.icon}</b>}
                        <em>{previewReady ? <><CirclePlay size={13} /> درس تجريبي</> : course.availableForPurchase ? "متاحة الآن" : "قيد الإعداد"}</em>
                      </span>
                      <span className={styles.courseBody}>
                        <small>{course.university} · {course.specialty}</small>
                        <strong>{course.title}</strong>
                        <bdi dir="ltr">{course.titleEn}{course.code ? " · " + course.code : ""}</bdi>
                        <span className={styles.courseMeta}><i>{course.lessons} درسًا</i><i>{course.duration}</i></span>
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

      <section className={styles.aiSection} aria-labelledby="ai-title" data-home-reveal>
        <div className={"container " + styles.aiShell}>
          <div className={styles.aiCopy}>
            <span className={styles.aiKicker}><Sparkles size={16} /> مراس AI</span>
            <h2 id="ai-title">حوّل ملفاتك إلى<br /><span>جلسة مذاكرة تفاعلية.</span></h2>
            <p>ارفع ملفك، ثم اطلب ملخصًا مركزًا، أو ترجمة تراعي المصطلحات العلمية، أو اختبارًا ببطاقات تفاعلية مع شرح الإجابات.</p>
            <div className={styles.aiFeatures}>
              <span><FileText size={16} /> تلخيص منظم</span>
              <span><Languages size={16} /> ترجمة أكاديمية</span>
              <span><ListChecks size={16} /> اختبار مع شرح</span>
              <span><MessageSquareText size={16} /> سجل محفوظ</span>
            </div>
            <Link href="/meras-ai" className={styles.aiAction}>ابدأ مع مراس AI <ArrowLeft size={18} /></Link>
            <small className={styles.aiNote}>مراس AI أداة مساعدة للتعلّم؛ راجع النتائج المهمة مع محتوى مقررك.</small>
          </div>

          <div className={styles.aiStudio} role="img" aria-label="معاينة لتحويل ملف دراسي إلى ملخص وترجمة واختبار">
            <div className={styles.aiStudioBar}><span><Bot size={18} /> استوديو مراس AI</span><small><i /> جاهز</small></div>
            <div className={styles.aiFile}>
              <i><FileText size={20} /></i>
              <span><strong>محاضرة الديناميكا الحرارية.pdf</strong><small>42 شريحة · اكتمل التحليل</small></span>
              <b>100%</b>
            </div>
            <div className={styles.aiFlow}>
              <article><i><Sparkles size={18} /></i><span><strong>ملخص مركز</strong><small>القوانين والمفاهيم الأساسية</small></span><em>جاهز</em></article>
              <article><i><Languages size={18} /></i><span><strong>ترجمة علمية</strong><small>مصطلحات محفوظة في سياقها</small></span><em>AR ⇄ EN</em></article>
              <article><i><ListChecks size={18} /></i><span><strong>اختبار تفاعلي</strong><small>12 سؤالًا مع شرح الإجابة</small></span><em>ابدأ</em></article>
            </div>
            <div className={styles.aiPrompt}><span>اسأل عن الملف أو اطلب شرحًا أبسط…</span><i><ArrowLeft size={16} /></i></div>
          </div>
        </div>
      </section>

      <section className={styles.paymentSection} aria-labelledby="payment-title" data-home-reveal>
        <div className={"container " + styles.paymentCard}>
          <div className={styles.paymentCopy}>
            <span className={styles.sectionKicker}>دفع واضح ومرن</span>
            <h2 id="payment-title">اشتراك آمن عبر Tap، وخيارات تقسيط عند توفرها.</h2>
            <p>تتم عملية الدفع من بوابة Tap، وتظهر تابي وتمارا وفق أهلية الطالب وقيمة الطلب والخدمات المفعّلة لدى مزود الدفع.</p>
          </div>
          <div className={styles.paymentProviders} aria-label="خيارات الدفع">
            <article className={styles.tapProvider}><span dir="ltr">tap</span><small>بوابة الدفع</small></article>
            <article><span>تابي</span><small>قسّمها على 4</small></article>
            <article><span>تمارا</span><small>ادفع لاحقًا</small></article>
          </div>
          <div className={styles.paymentTrust}>
            <span><ShieldCheck size={17} /> لا نخزن بيانات بطاقتك</span>
            <span><LockKeyhole size={17} /> تحقق وتفعيل من الخادم</span>
            <span><WalletCards size={17} /> الخيارات تخضع لأهلية المزود</span>
          </div>
        </div>
      </section>

      <section className={styles.finalSection} data-home-reveal>
        <div className={"container " + styles.finalCard}>
          <div className={styles.finalGlow} aria-hidden="true" />
          <span className={styles.finalIcon}><Zap size={23} /></span>
          <div>
            <small>خطوتك التالية واضحة</small>
            <h2>ابدأ من المادة التي تهمك اليوم.</h2>
            <p>استكشف المحتوى، شاهد المتاح للتجربة، ثم اختر ما يناسب مسارك.</p>
          </div>
          <div className={styles.finalActions}>
            <Link href="/courses">استكشف المواد <ArrowLeft size={17} /></Link>
            <Link href="/request-course">لم تجد مادتك؟ اطلبها</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
