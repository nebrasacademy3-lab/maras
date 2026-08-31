import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpenCheck,
  CirclePlay,
  Clock3,
  GraduationCap,
  Headphones,
  Play,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroSearch } from "@/components/hero-search";
import { UniversityCard } from "@/components/university-card";
import { CourseCard } from "@/components/course-card";
import { HomeIntro } from "@/components/home-intro";
import { BrandMark } from "@/components/brand-mark";
import { faq } from "@/lib/data";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";

export const revalidate = 60;

export default async function Home() {
  const [institutions, courses] = await Promise.all([getInstitutionsCatalog(), getCoursesCatalog()]);
  const tabbyEnabled = process.env.TAP_TABBY_ENABLED === "true";
  const tamaraEnabled = process.env.TAP_TAMARA_ENABLED === "true";
  const featuredUniversities = institutions.filter((institution) => institution.featured).slice(0, 4);
  const featuredCourses = courses.filter((course) => course.featured).slice(0, 4);
  const universityPreview = featuredUniversities.length ? featuredUniversities : institutions.slice(0, 4);
  const coursePreview = featuredCourses.length ? featuredCourses : courses.slice(0, 4);

  return (
    <main className="home-page">
      <HomeIntro />
      <SiteHeader />

      <section className="home-hero">
        <div className="home-hero-mesh" aria-hidden="true" />
        <div className="container home-hero-grid">
          <div className="home-hero-copy">
            <div className="home-eyebrow"><BadgeCheck size={17} /> منصة جامعية مبنية للطالب السعودي</div>
            <h1>افهم مادتك.<br /><span>وتقدّم بثقة.</span></h1>
            <p>اختر جامعتك أو ابحث عن المادة، شاهد درسًا تجريبيًا، ثم أكمل تعلّمك من آخر ثانية وصلت إليها.</p>
            <HeroSearch courses={courses} institutions={institutions} />
            <div className="home-hero-actions">
              <Link href="/courses" className="button button-primary">استكشف المواد <ArrowLeft size={17} /></Link>
              <Link href="/register" className="button button-ghost">أنشئ حسابك مجانًا</Link>
            </div>
            <div className="home-hero-trust" aria-label="مزايا مراس">
              <span><CirclePlay size={16} /> درس تجريبي قبل الاشتراك</span>
              <span><ShieldCheck size={16} /> دفع آمن وتفعيل تلقائي</span>
              <span><WalletCards size={16} /> تابي وتمارا عبر Tap</span>
            </div>
          </div>

          <div className="home-preview" aria-label="معاينة تجربة التعلم في مراس">
            <div className="home-preview-card">
              <header>
                <BrandMark />
                <span><small>مراس العلم</small><strong>غرفتك التعليمية</strong></span>
                <em><i /> درس تجريبي</em>
              </header>
              <div className="home-preview-screen">
                <div className="home-preview-grid" aria-hidden="true" />
                <span className="home-preview-chip">الهياكل المتقطعة</span>
                <div className="home-preview-title"><small>الوحدة الأولى · الدرس 3</small><strong>جداول الصواب</strong></div>
                <span className="home-preview-play" aria-hidden="true"><Play size={25} fill="currentColor" /></span>
                <div className="home-preview-progress"><i><b /></i><span>18:32</span><span>31:44</span></div>
              </div>
              <footer>
                <span><small>تقدّمك في المادة</small><strong>68% مكتمل</strong></span>
                <i><b /></i>
                <Link href="/courses">متابعة التعلّم <ArrowLeft size={15} /></Link>
              </footer>
            </div>
            <div className="home-float-card home-float-one"><Clock3 size={18} /><span><strong>محفوظ تلقائيًا</strong><small>ارجع لنفس الثانية</small></span></div>
            <div className="home-float-card home-float-two"><Sparkles size={18} /><span><strong>ملاحظات ذكية</strong><small>مرتبطة بوقت الفيديو</small></span></div>
          </div>
        </div>
      </section>

      <section className="home-proof" aria-label="لماذا مراس">
        <div className="container home-proof-grid">
          <article><i><GraduationCap size={22} /></i><span><strong>حسب جامعتك</strong><small>مواد وتخصصات مرتبة بلا قوائم مربكة.</small></span></article>
          <article><i><BookOpenCheck size={22} /></i><span><strong>تعلّم متصل</strong><small>تقدمك وملاحظاتك محفوظة على كل أجهزتك.</small></span></article>
          <article><i><Headphones size={22} /></i><span><strong>دعم واضح</strong><small>تابع طلبك وردود الفريق من مكان واحد.</small></span></article>
        </div>
      </section>

      <section className="section home-catalog-section">
        <div className="container">
          <div className="section-head"><div><span className="section-kicker">ابدأ من جامعتك</span><h2>اختر وجهتك التعليمية</h2><p>نوصلك مباشرة إلى التخصصات والمواد المتاحة لك.</p></div><Link href="/universities" className="button button-ghost">كل الجامعات <ArrowLeft size={16} /></Link></div>
          <div className="universities-grid home-universities-grid">{universityPreview.map((institution) => <UniversityCard key={institution.slug} institution={institution} />)}</div>
        </div>
      </section>

      <section className="section home-courses-section">
        <div className="container">
          <div className="section-head"><div><span className="section-kicker">جاهزة للبدء</span><h2>مواد مختارة لك</h2><p>شاهد الدرس المجاني ثم قرر إن كانت المادة مناسبة لك.</p></div><Link href="/courses" className="button button-ghost">كل المواد <ArrowLeft size={16} /></Link></div>
          <div className="courses-grid home-courses-grid">{coursePreview.map((course) => <CourseCard key={course.slug} course={course} />)}</div>
        </div>
      </section>

      <section className="section home-payments-section">
        <div className="container home-payments-card">
          <div className="home-payment-copy"><span className="section-kicker">ميزة التقسيط المرن</span><h2>تابي وتمارا ضمن خيارات الدفع في مراس عبر Tap.</h2><p>قسّط اشتراكك بسهولة من خلال صفحة Tap الآمنة، وستظهر لك خيارات تابي وتمارا المناسبة وفق أهلية الخدمة وقيمة الطلب.</p><div><ShieldCheck size={17} /> لا نخزن بيانات بطاقتك داخل مراس</div></div>
          <div className="home-payment-options" aria-label="مزايا الدفع والتقسيط عبر Tap">
            <article className="payment-option-tap"><span>tap</span><strong>دفع إلكتروني</strong><small>مدى · Visa · Mastercard · Apple Pay</small></article>
            <article className={`payment-option-tabby${tabbyEnabled ? " is-enabled" : ""}`}><span>تابي</span><strong>قسّمها على 4</strong><small>{tabbyEnabled ? "دفعات مرنة وفق أهلية تابي عبر Tap" : "خيار تقسيط عبر Tap وفق أهلية الطلب"}</small></article>
            <article className={`payment-option-tamara${tamaraEnabled ? " is-enabled" : ""}`}><span>تمارا</span><strong>اشترِ الآن وادفع لاحقًا</strong><small>{tamaraEnabled ? "خيارات التقسيط وفق أهلية تمارا عبر Tap" : "خيار تقسيط عبر Tap وفق أهلية الطلب"}</small></article>
          </div>
        </div>
      </section>

      <section className="section home-final-section">
        <div className="container home-final-grid">
          <div className="home-request-card"><i><Zap size={25} /></i><span><small>لم تجد مادتك؟</small><h2>اطلبها وسنخبرك عند توفرها.</h2><p>أرسل اسم المادة والجامعة خلال أقل من دقيقة، وتابع الحالة من حسابك.</p></span><Link href="/request-course" className="button button-white">اطلب مادة <ArrowLeft size={16} /></Link></div>
          <div className="home-faq-card" id="faq"><div><span className="section-kicker">قبل أن تبدأ</span><h2>أسئلة سريعة</h2></div><div>{faq.slice(0, 4).map((item, index) => <details key={item.q} open={index === 0}><summary>{item.q}<span>+</span></summary><p>{item.a}</p></details>)}</div></div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
