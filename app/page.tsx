/* eslint-disable @next/next/no-img-element -- raw brand artwork avoids runtime image transforms in both themes */
import Link from "next/link";
import {
  ArrowLeft, BadgeCheck, BookOpenCheck, CheckCircle2, ChevronLeft,
  CirclePlay, Clock3, CreditCard, GraduationCap, Headphones, MonitorPlay,
  Play, SearchCheck, ShieldCheck, Sparkles, TrendingUp, UsersRound,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroSearch } from "@/components/hero-search";
import { UniversityCard } from "@/components/university-card";
import { CourseCard } from "@/components/course-card";
import { AnimatedStats } from "@/components/animated-stats";
import { faq, reviews } from "@/lib/data";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
import { getPublicSettings } from "@/lib/platform-settings";

export const revalidate = 60;

export default async function Home() {
  const [institutions, courses, settings] = await Promise.all([getInstitutionsCatalog(), getCoursesCatalog(), getPublicSettings()]);
  const featuredUniversities = institutions.filter((institution) => institution.featured).slice(0, 6);
  const featuredCourses = courses.filter((course) => course.featured).slice(0, 6);
  const universityPreview = featuredUniversities.length ? featuredUniversities : institutions.slice(0, 6);
  const coursePreview = featuredCourses.length ? featuredCourses : courses.slice(0, 6);
  const platformStats = [
    { value: institutions.length, label: "جامعة وكلية وجهة تقنية" },
    { value: courses.length, label: "مادة منشورة" },
    { value: "24/7", label: "مساعد مراس الذكي" },
    { value: "100%", label: "تجربة متجاوبة" },
  ];
  return (
    <main>
      <div className="top-announcement">
        <div className="container"><span><Sparkles size={14} /> جديد مراس</span><p>{settings.announcement || "أول درس مجاني في كل مادة — جرّب قبل الاشتراك"}</p><Link href="/courses">استكشف المواد <ArrowLeft size={14} /></Link></div>
      </div>
      <SiteHeader />

      <section className="hero-section">
        <div className="hero-glow hero-glow-one" /><div className="hero-glow hero-glow-two" />
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span><BadgeCheck size={16} /></span> منصة تعليم جامعي سعودية</div>
            <h1>شرح جامعتك،<br /><span>في مكان واحد.</span></h1>
            <p>اختر جامعتك وتخصصك، شاهد شرحًا مجانيًا قبل الاشتراك، وابدأ التعلّم بخطوات واضحة حتى الاختبار.</p>
            <HeroSearch courses={courses} institutions={institutions} />
            <div className="hero-trust"><div className="avatar-stack"><span>ج</span><span>ك</span><span>ت</span><span>+{institutions.length}</span></div><div><div className="stars">جامعات · كليات · تدريب تقني</div><p>فهرس سعودي مترابط وقابل للإدارة والتحديث</p></div></div>
          </div>

          <div className="hero-visual" aria-label="تجربة الطالب داخل مراس">
            <div className="hero-dashboard-card">
              <div className="mock-window-bar"><span /><span /><span /><i>لوحة الطالب</i></div>
              <div className="mock-welcome"><div><small>مساء الخير، محمد 👋</small><h3>كمّل رحلتك التعليمية</h3></div><span className="mock-bell">3</span></div>
              <div className="mock-progress-card">
                <div className="mock-course-art"><span>∑</span><i><Play size={15} fill="currentColor" /></i></div>
                <div className="mock-course-info"><small>تكمل الآن</small><strong>الهياكل المتقطعة</strong><p>Truth Tables · 18:32</p><div className="mock-progress"><i style={{ width: "68%" }} /></div><span>68% مكتمل</span></div>
              </div>
              <div className="mock-stats"><div><i><BookOpenCheck size={17} /></i><strong>4</strong><small>موادي</small></div><div><i><Clock3 size={17} /></i><strong>26h</strong><small>تعلمت</small></div><div><i><TrendingUp size={17} /></i><strong>73%</strong><small>متوسط التقدم</small></div></div>
              <div className="mock-next"><span><CheckCircle2 size={16} /> الدرس التالي</span><strong>Logical Equivalences</strong><button>متابعة <ChevronLeft size={14} /></button></div>
            </div>
            <div className="floating-card floating-free"><span><CirclePlay size={20} /></span><div><strong>جرّب مجانًا</strong><small>قبل ما تشترك</small></div></div>
            <div className="floating-card floating-secure"><span><ShieldCheck size={20} /></span><div><strong>دفع آمن</strong><small>عبر Tap</small></div></div>
            <div className="floating-orbit orbit-one" /><div className="floating-orbit orbit-two" />
          </div>
        </div>
        <div className="container"><AnimatedStats items={platformStats} /></div>
      </section>

      <section className="section universities-preview">
        <div className="container">
          <div className="section-head"><div><span className="section-kicker">ابدأ من جامعتك</span><h2>جامعات المملكة بين يديك</h2><p>اختر جامعتك لتشاهد التخصصات والمواد المتوفرة لها.</p></div><Link href="/universities" className="button button-ghost">عرض جميع الجامعات <ArrowLeft size={16} /></Link></div>
          <div className="universities-grid">{universityPreview.map((institution) => <UniversityCard key={institution.slug} institution={institution} />)}</div>
        </div>
      </section>

      <section className="section courses-section">
        <div className="container">
          <div className="section-head"><div><span className="section-kicker">الأكثر طلبًا</span><h2>مواد يبدأ بها الطلاب الآن</h2><p>شروحات مرتبة حسب محتوى المقرر مع درس تجريبي مجاني.</p></div><Link href="/courses" className="button button-ghost">تصفّح كل المواد <ArrowLeft size={16} /></Link></div>
          <div className="courses-grid">{coursePreview.map((course) => <CourseCard key={course.slug} course={course} />)}</div>
        </div>
      </section>

      <section className="section how-section">
        <div className="container">
          <div className="center-head"><span className="section-kicker">رحلة بسيطة وواضحة</span><h2>من البحث إلى الفهم في أربع خطوات</h2><p>صممنا مراس لتصل إلى شرح مادتك بأقل عدد ممكن من الخطوات.</p></div>
          <div className="steps-grid">
            <article><b>01</b><i><SearchCheck size={25} /></i><h3>ابحث</h3><p>اكتب اسم الجامعة أو التخصص أو المادة واحصل على نتائج فورية.</p></article>
            <article><b>02</b><i><MonitorPlay size={25} /></i><h3>جرّب مجانًا</h3><p>شاهد درسًا حقيقيًا لتتأكد من جودة الصوت والشرح والأسلوب.</p></article>
            <article><b>03</b><i><CreditCard size={25} /></i><h3>اشترك بأمان</h3><p>أكمل الدفع عبر Tap وتظهر المادة تلقائيًا داخل حسابك.</p></article>
            <article><b>04</b><i><GraduationCap size={25} /></i><h3>تعلّم وتقدّم</h3><p>أكمل من نفس الثانية وتابع إنجازك حتى نهاية المادة.</p></article>
          </div>
        </div>
      </section>

      <section className="section player-feature-section">
        <div className="container player-feature-grid">
          <div className="player-copy">
            <span className="section-kicker">مشغل صُنع للتعلّم</span>
            <h2>درسُك يبقى داخل مراس، وتقدّمك لا يضيع.</h2>
            <p>مشغل خاص بالمنصة يجمع تجربة مشاهدة مريحة مع طبقات حماية تقلل مشاركة المحتوى خارج حساب الطالب.</p>
            <ul>
              <li><CheckCircle2 size={18} /> متابعة تلقائية من آخر ثانية</li>
              <li><CheckCircle2 size={18} /> سرعات تشغيل من 0.5× حتى 2×</li>
              <li><CheckCircle2 size={18} /> جودة تلقائية ووضع ملء الشاشة</li>
              <li><CheckCircle2 size={18} /> علامة مائية متحركة باسم الطالب</li>
              <li><CheckCircle2 size={18} /> جلسات مشاهدة وروابط قصيرة الصلاحية</li>
            </ul>
            <Link href="/courses/discrete-structures" className="button button-primary">شاهد الدرس التجريبي <CirclePlay size={17} /></Link>
          </div>
          <div className="player-demo-shell">
            <div className="player-demo-screen">
              <span className="player-demo-watermark">محمد أ. · M-1048</span>
              <div className="player-demo-logo"><img src="/brand/logo-dark-hq.png" alt="" width={1984} height={1156} loading="lazy" decoding="async" /></div>
              <div className="player-demo-content"><span>Discrete Structures</span><strong>Truth Tables</strong><small>الوحدة الأولى · الدرس 3</small></div>
              <div className="big-play"><Play size={26} fill="currentColor" /></div>
              <div className="player-controls-demo"><div className="player-timeline"><i /></div><div><span>18:32 / 31:44</span><p><b>1×</b><b>1080p</b><b>⛶</b></p></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="section experience-section">
        <div className="container experience-grid">
          <div className="experience-card"><div className="experience-icon"><UsersRound size={25} /></div><h3>شرح يراعي محتوى جامعتك</h3><p>كل مادة مرتبطة بجامعتها وتخصصاتها، بدون قوائم مربكة أو محتوى عام بعيد عن مقرر الطالب.</p><Link href="/universities">اختر جامعتك <ArrowLeft size={15} /></Link></div>
          <div className="experience-card featured"><div className="experience-icon"><ShieldCheck size={25} /></div><h3>وصول موثوق ومحتوى محمي</h3><p>الدفع يُعتمد من الخادم، والصلاحية تُمنح بعد تأكيد Tap، والفيديو المدفوع لا يملك رابطًا عامًا.</p><Link href="/how-it-works">اعرف كيف نحمي حسابك <ArrowLeft size={15} /></Link></div>
          <div className="experience-card"><div className="experience-icon"><Headphones size={25} /></div><h3>دعم يفهم مشكلة الطالب</h3><p>تذكرة للدفع أو الفيديو أو المادة مع حالة واضحة، وإشعار فور وصول رد فريق الدعم.</p><Link href="/support">تواصل مع الدعم <ArrowLeft size={15} /></Link></div>
        </div>
      </section>

      <section className="section reviews-section">
        <div className="container">
          <div className="center-head"><span className="section-kicker">معايير التجربة</span><h2>ما الذي تحصل عليه داخل مراس؟</h2><p>وعود قابلة للتحقق داخل المنتج، بلا أرقام أو شهادات مستخدمين غير موثقة.</p></div>
          <div className="reviews-grid">{reviews.map((review) => <article key={review.name}><div className="review-stars"><CheckCircle2 size={18} /> مدمج في المنصة</div><p>{review.text}</p><div><span>{review.name[0]}</span><strong>{review.name}<small>{review.university}</small></strong></div></article>)}</div>
        </div>
      </section>

      <section className="section request-banner-section">
        <div className="container request-banner">
          <div className="request-banner-icon"><TrendingUp size={34} /></div>
          <div><span>نبني المحتوى حسب احتياجكم</span><h2>ما لقيت مادتك؟ اطلبها في أقل من دقيقة.</h2><p>سنجمع الطلبات حسب الجامعة والتخصص، ونخبرك عندما يبدأ تجهيز الشرح أو يصبح متاحًا.</p></div>
          <Link href="/request-course" className="button button-white">اطلب توفير مادة <ArrowLeft size={17} /></Link>
        </div>
      </section>

      <section className="section faq-section" id="faq">
        <div className="container faq-grid"><div className="faq-intro"><span className="section-kicker">الأسئلة الشائعة</span><h2>إجابات مختصرة قبل أن تبدأ</h2><p>وإذا بقي عندك سؤال، فريق الدعم موجود لمساعدتك.</p><Link href="/support" className="button button-ghost">اسأل فريق مراس</Link></div><div className="faq-list">{faq.map((item, index) => <details key={item.q} open={index === 0}><summary>{item.q}<span>+</span></summary><p>{item.a}</p></details>)}</div></div>
      </section>

      <section className="final-cta-section"><div className="container final-cta"><div className="final-cta-glow" /><div><span><Sparkles size={16} /> ابدأ بالدرس المجاني</span><h2>مادتك أوضح عندما يكون الشرح على طريقتك.</h2><p>أنشئ حسابك، اختر جامعتك وتخصصك، وابدأ التجربة مجانًا.</p></div><div><Link href="/register" className="button button-white">أنشئ حسابك مجانًا <ArrowLeft size={17} /></Link><Link href="/courses" className="button button-outline-white">استكشف المواد</Link></div></div></section>
      <SiteFooter />
    </main>
  );
}
