import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, BookMarked, Building2, CirclePlay, ExternalLink, FileText, GraduationCap, Languages, LockKeyhole, MessageSquareText, MonitorSmartphone, NotebookPen, ShieldCheck, Sparkles, TimerReset, WalletCards } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HomeGateway } from "@/components/home-gateway";
import { HomeHorizontalRail } from "@/components/home-horizontal-rail";
import { HomeUpcomingTracks } from "@/components/home-upcoming-tracks";
import { HomeFaq } from "@/components/home-faq";
import { UniversityLogo } from "@/components/university-logo";
import { CourseCoverImage } from "@/components/course-cover-image";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
import { getPublicLearningTracks } from "@/lib/learning-tracks";
import { getPublicPartners } from "@/lib/platform-partners";
import { getPublicReviews } from "@/lib/public-reviews";
import { getPublicSettings, PUBLIC_SETTING_DEFAULTS } from "@/lib/platform-settings";
import type { Course } from "@/lib/data";
import styles from "./home.module.css";
import { publicPageMetadata } from "@/lib/seo";

export const revalidate = 60;
export const metadata: Metadata = publicPageMetadata("/", "شروحات المقررات الجامعية في السعودية", "استكشف شروحات المقررات حسب الجامعة والتخصص، وشاهد المعاينات المجانية المتاحة، وواصل تعلمك وملفاتك من حساب واحد في مراس العلم.");
const priceFormatter = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 });
function hasReadyPreview(course: Course) { return course.units.some((unit) => unit.lessons.some((lesson) => lesson.free && lesson.ready)); }
function uniqueCourses(courses: Course[]) { const seen = new Set<string>(); return courses.filter((course) => { if (seen.has(course.slug)) return false; seen.add(course.slug); return true; }); }
function isHttps(value: string) { try { return new URL(value).protocol === "https:"; } catch { return false; } }

export default async function Home() {
  const [institutions, courses, learningTracks, settings, partners, reviews] = await Promise.all([getInstitutionsCatalog(), getCoursesCatalog(), getPublicLearningTracks(), getPublicSettings(), getPublicPartners(), getPublicReviews()]);
  const universityPreview = [...institutions].sort((left, right) => Number(Boolean(right.featured)) - Number(Boolean(left.featured)) || right.courses - left.courses).slice(0, 12);
  const availableCourses = courses.filter((course) => course.availableForPurchase || hasReadyPreview(course));
  const coursePreview = uniqueCourses([...availableCourses.filter((course) => course.featured), ...availableCourses, ...courses]).slice(0, 12);
  const searchCourses = courses.map(({ slug, title, titleEn, university, specialty, audienceScope }) => ({ slug, title, titleEn, university, specialty: audienceScope === "institution" ? "جميع تخصصات الجامعة" : specialty }));
  const searchInstitutions = institutions.map(({ slug, name, nameEn, region, type }) => ({ slug, name, nameEn, region, type }));
  const featured = coursePreview[0];
  const gatewayCourse = featured ? { slug: featured.slug, title: featured.title, university: featured.university, specialty: featured.audienceScope === "institution" ? "متاحة لتخصصات الجامعة" : featured.specialty, lessons: featured.lessons, price: featured.price, access: featured.access, previewReady: hasReadyPreview(featured) } : undefined;
  const firstClaim = settings.first_platform_claim_text.trim() || PUBLIC_SETTING_DEFAULTS.first_platform_claim_text;
  const credentials = [
    { label: "السجل التجاري", value: settings.commercial_registration_number, href: settings.commercial_registration_verify_url, icon: Building2 },
    { label: "توثيق التجارة الإلكترونية", value: settings.ecommerce_authentication_number, href: settings.ecommerce_authentication_verify_url, icon: BadgeCheck },
    { label: settings.nelc_program_name || "المركز الوطني للتعليم الإلكتروني", value: settings.nelc_program_license_number, href: settings.nelc_program_license_verify_url, icon: ShieldCheck },
  ] as Array<{ label: string; value: string; href: string; icon: typeof BadgeCheck }>;

  return <main className={styles.page}>
    <SiteHeader />
    <HomeGateway courses={searchCourses} institutions={searchInstitutions} featuredCourse={gatewayCourse} firstClaim={firstClaim} showPayments={settings.payment_methods_marketing_enabled !== "false"} />



    <section className={styles.catalogSection} id="explore" aria-labelledby="universities-title" data-home-reveal><div className="container"><header className={styles.sectionHeading}><div><span><GraduationCap size={16} /> ابدأ من جامعتك</span><h2 id="universities-title">جامعتك. موادك. بداية أوضح.</h2></div><div><p>حرّك البطاقات، اختر جامعتك، ثم انتقل إلى تخصصك والمواد المرتبطة به.</p><Link href="/universities">جميع الجامعات <ArrowLeft size={16} /></Link></div></header><HomeHorizontalRail label="الجامعات">{universityPreview.map((institution) => <Link key={institution.slug} href={`/universities/${institution.slug}`} className={styles.universityCard}><span className={styles.universityMark}><UniversityLogo institution={institution} /></span><span><small>{institution.region} · {institution.type}</small><strong>{institution.name}</strong><bdi dir="ltr">{institution.nameEn}</bdi></span><footer><em>{institution.courses.toLocaleString("ar-SA")} مواد</em><ArrowLeft size={17} /></footer></Link>)}</HomeHorizontalRail></div></section>

    {coursePreview.length ? <section className={styles.courseSection} aria-labelledby="courses-title" data-home-reveal><div className="container"><header className={styles.sectionHeading}><div><span><BookMarked size={16} /> مواد مختارة</span><h2 id="courses-title">شرح أقرب للفهم.</h2></div><div><p>اكتشف موادك، تعرّف على محتواها، وجرّب الدروس المتاحة قبل الاشتراك.</p><Link href="/courses">كل المواد <ArrowLeft size={16} /></Link></div></header><HomeHorizontalRail label="المواد">{coursePreview.map((course) => { const previewReady = hasReadyPreview(course); return <Link key={course.slug} href={`/courses/${course.slug}`} className={styles.courseCard}><span className={styles.courseMedia}>{course.coverImage ? <CourseCoverImage className={styles.courseImage} src={course.coverImage} alt="" sizes="(max-width: 700px) 82vw, 390px" /> : <b>{course.icon}</b>}<em>{previewReady ? <><CirclePlay size={13} /> درس تجريبي</> : course.availableForPurchase ? "متاحة الآن" : "قريبًا"}</em></span><span className={styles.courseBody}><small>{course.university}</small><strong>{course.title}</strong><bdi dir="ltr">{course.titleEn}{course.code ? ` · ${course.code}` : ""}</bdi><span className={styles.courseMeta}><i>{course.lessons.toLocaleString("ar-SA")} درسًا</i><i>{course.duration}</i></span><footer><span>{course.price > 0 ? <><b>{priceFormatter.format(course.price)}</b> ر.س</> : <b>مجاني</b>}</span><em>{course.availableForPurchase || previewReady ? "التفاصيل" : "احجز تنبيهك"} <ArrowLeft size={15} /></em></footer></span></Link>; })}</HomeHorizontalRail></div></section> : null}

    <section className={styles.learningSection} aria-labelledby="learning-title" data-home-reveal><div className={`container ${styles.learningShell}`}><header><span><Sparkles size={16} /> تجربة متصلة</span><h2 id="learning-title">من المشاهدة إلى المراجعة، دون تشتيت.</h2><p>أدوات عملية تحفظ وقت الطالب وتبقي كل ما يحتاجه مرتبطًا بالمادة والحساب.</p><Link href="/study-tools">افتح أدوات المذاكرة <ArrowLeft size={16} /></Link></header><div className={styles.featureGrid}><article><i><NotebookPen size={20} /></i><b>ملاحظات عند نفس اللحظة</b><p>احفظ الملاحظة على دقيقة وثانية محددتين، ثم ارجع إليها بضغطة.</p></article><article><i><TimerReset size={20} /></i><b>تقدّم يتابعك</b><p>أكمل من آخر موضع شاهدته عبر أجهزتك المصرح بها.</p></article><article><i><FileText size={20} /></i><b>ملفات مرتبطة بالمادة</b><p>نزّل الملفات التي ينشرها فريق المادة من مساحة تعلم واحدة.</p></article><article><i><Languages size={20} /></i><b>تلخيص وترجمة وتدريب</b><p>حوّل ملفك إلى ملخص أو ترجمة أو بطاقات أسئلة منظمة داخل حسابك.</p></article></div></div></section>

    {reviews.length ? <section className={styles.reviewsSection} aria-labelledby="reviews-title" data-home-reveal><div className="container"><header className={styles.sectionHeading}><div><span><MessageSquareText size={16} /> تجارب الطلاب</span><h2 id="reviews-title">تجارب تحكي الفرق.</h2></div><div><p>من طلاب مراس؛ تجاربهم مع الشرح والمذاكرة والوصول إلى فهم أوضح.</p></div></header><HomeHorizontalRail label="آراء الطلاب">{reviews.map((review) => <article className={styles.reviewCard} key={review.id}><header><span>{review.author.slice(0, 1)}</span><div><strong>{review.author}</strong><small>{review.specialty}</small></div><em>{"★".repeat(review.rating)}</em></header><p>{review.body}</p><footer><BadgeCheck size={14} /> وصول موثّق للمادة · {new Date(review.createdAt).toLocaleDateString("ar-SA")}</footer></article>)}</HomeHorizontalRail></div></section> : null}

    {partners.length ? <section className={styles.partnersSection} aria-labelledby="partners-title" data-home-reveal><div className="container"><header className={styles.centerHeading}><span>شركاء واعتمادات المنصة</span><h2 id="partners-title">معًا، نوسّع آفاق التعلّم.</h2><p>تعرّف على شركاء المنصة والاعتمادات المسجلة.</p></header><HomeHorizontalRail label="شركاء واعتمادات المنصة">{partners.map((partner) => <article className={styles.partnerCard} key={partner.id}><span><Image src={partner.logo} alt={`شعار ${partner.name}`} width={220} height={100} sizes="220px" unoptimized={partner.logo.startsWith("https://")} /></span><strong>{partner.name}</strong>{partner.description ? <p>{partner.description}</p> : null}<small>{partner.kind === "accreditation" ? "اعتماد أو ترخيص" : partner.kind === "payment" ? "حلول دفع" : "شريك المنصة"}</small>{partner.credentialNumber ? <div className={styles.partnerCredential}><span>رقم الاعتماد أو الترخيص</span><bdi dir="ltr">{partner.credentialNumber}</bdi></div> : null}{partner.verificationUrl || partner.destinationUrl ? <div className={styles.partnerActions}>{partner.verificationUrl ? <a href={partner.verificationUrl} target="_blank" rel="noopener noreferrer"><BadgeCheck size={14} /> {partner.kind === "accreditation" ? "تحقق من الاعتماد" : "فتح رابط التحقق"}</a> : null}{partner.destinationUrl && partner.destinationUrl !== partner.verificationUrl ? <a href={partner.destinationUrl} target="_blank" rel="noopener noreferrer">موقع الجهة <ExternalLink size={13} /></a> : null}</div> : null}</article>)}</HomeHorizontalRail></div></section> : null}

    <HomeUpcomingTracks tracks={learningTracks} />
    {settings.payment_methods_marketing_enabled !== "false" ? <section className={styles.paymentSection} id="payment" aria-labelledby="payment-title" data-home-reveal>
      <div className={`container ${styles.paymentShell}`}>
        <div><span><WalletCards size={17} /> راحة في التعلّم. مرونة في الدفع.</span><h2 id="payment-title">خطوتك القادمة،<br />على راحتك.</h2><p>تابي وتمارا ضمن خيارات التقسيط عبر Tap. اختر مادتك، واطّلع على الوسائل المتاحة لطلبك قبل إتمام الدفع.</p><div><i><LockKeyhole size={16} /> بيانات بطاقتك لا تُحفظ لدينا</i><i><MonitorSmartphone size={16} /> اشتراكك مرتبط بحسابك</i></div></div>
        <aside><small>خيارات تناسبك، من الدفع إلى التقسيط</small><div className={styles.paymentBrands}><span className={styles.tabbyBrand}>tabby<span>تابي</span></span><span className={styles.tamaraBrand}>tamara<span>تمارا</span></span><span className={styles.cardPayment}>مدى<span lang="en">mada</span></span><span className={styles.cardPayment} dir="ltr">VISA<span>فيزا</span></span><span className={styles.cardPayment} dir="ltr">Mastercard<span>ماستركارد</span></span><span className={styles.cardPayment} dir="ltr">Apple Pay<span>آبل باي</span></span></div><p>تظهر الوسائل المفعّلة والمتاحة لطلبك عند الدفع. يخضع التقسيط للأهلية وشروط مقدم الخدمة.</p><Link href="/courses">اكتشف مادتك <ArrowLeft size={16} /></Link><small className={styles.poweredBy}>بوابة الدفع <b dir="ltr">Tap</b></small></aside>
      </div>
    </section> : null}
    <section className={styles.finalSection} data-home-reveal><div className={`container ${styles.finalCard}`}><span aria-hidden="true">✦</span><div><small>لم تجد ما تبحث عنه؟</small><h2>اطلب المادة، واترك لنا تفاصيلها.</h2><p>أرسل الجامعة والتخصص واسم المادة، وسيتابع الطلب فريق المنصة من حسابك.</p></div><div><Link href="/request-course">أرسل طلب مادة <ArrowLeft size={16} /></Link><Link href="/courses">استكشف الكتالوج</Link></div></div></section>
    <section className={styles.credentials} aria-labelledby="credentials-title"><div className="container"><header className={styles.compactHeading}><span>بيانات المنشأة</span><h2 id="credentials-title">مراس العلم، عن قرب.</h2><p>بيانات المنشأة والسجل التجاري والتراخيص في مكان واحد.</p></header><div className={styles.credentialGrid}>{credentials.map(({ label, value, href, icon: Icon }) => { const content = <><i><Icon size={21} /></i><span><small>{label}</small>{value ? <strong dir="ltr">{value}</strong> : null}</span>{isHttps(href) ? <em>تحقق <ArrowLeft size={14} /></em> : null}</>; return isHttps(href) ? <a key={label} href={href} target="_blank" rel="noreferrer">{content}</a> : <article key={label}>{content}</article>; })}</div></div></section>
    <HomeFaq title="كل ما تحتاجه قبل الاشتراك" /><SiteFooter />
  </main>;
}
