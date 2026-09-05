"use client";

import { useState, type ElementType } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Check,
  FileText,
  Languages,
  ListChecks,
  NotebookPen,
  Play,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { HeroSearch, type SearchCourse, type SearchInstitution } from "@/components/hero-search";
import styles from "./home-gateway.module.css";

type Intent = "course" | "slides" | "summary" | "quiz" | "resume";

type FeaturedCourse = {
  slug: string;
  title: string;
  university: string;
  specialty: string;
  lessons: number;
  price: number;
  access: string;
  previewReady: boolean;
};

type ResumeCourse = {
  slug: string;
  title: string;
  lessonTitle: string;
  progress: number;
} | null;

const intentMeta: Array<{ id: Intent; label: string; icon: ElementType }> = [
  { id: "course", label: "أبحث عن مادة", icon: BookOpen },
  { id: "slides", label: "لدي سلايدات", icon: UploadCloud },
  { id: "summary", label: "لخّص لي", icon: FileText },
  { id: "quiz", label: "اختبرني", icon: ListChecks },
];

const aiActions: Record<Exclude<Intent, "course" | "resume">, { title: string; copy: string; href: string; action: string }> = {
  slides: {
    title: "افتح ملفك داخل مساحة تعلّم",
    copy: "أضف ملفك، ثم اختر التلخيص أو الترجمة أو إنشاء اختبار تفاعلي.",
    href: "/study-tools",
    action: "أضف ملفك إلى أدوات مراس",
  },
  summary: {
    title: "استخرج الفكرة قبل التفاصيل",
    copy: "حوّل الصفحات الطويلة إلى نقاط مرتبة تساعدك على المراجعة.",
    href: "/study-tools?service=summary",
    action: "أنشئ ملخصًا",
  },
  quiz: {
    title: "حوّل السلايدات إلى تدريب",
    copy: "أنشئ أسئلة تفاعلية مع شرح الإجابة من الملف الذي تدرسه.",
    href: "/study-tools?service=quiz",
    action: "أنشئ اختبارًا",
  },
};

function AiComposer({ intent }: { intent: Exclude<Intent, "course" | "resume"> }) {
  const action = aiActions[intent];
  return (
    <Link href={action.href} className={styles.aiComposer}>
      <span><UploadCloud size={19} /></span>
      <div><strong>{action.title}</strong><small>{action.copy}</small></div>
      <em>{action.action}<ArrowLeft size={16} /></em>
    </Link>
  );
}

function CourseCanvas({ course }: { course?: FeaturedCourse }) {
  if (!course) {
    return (
      <div className={styles.emptyCanvas}>
        <BookOpen size={31} />
        <strong>ابدأ من كتالوج المواد</strong>
        <Link href="/courses">استكشف المواد <ArrowLeft size={15} /></Link>
      </div>
    );
  }
  return (
    <div className={styles.courseCanvas}>
      <div className={styles.canvasLabel}><span><i /> داخل تجربة مراس</span><small>مادة من الكتالوج</small></div>
      <Link className={styles.lessonVisual} href={"/courses/" + course.slug + (course.previewReady ? "#preview" : "")}>
        <div className={styles.lessonArtwork} aria-hidden="true"><span /><span /><span /><BookOpen size={46} strokeWidth={1.3} /></div>
        <div className={styles.lessonCaption}><small>من السؤال، إلى الفهم</small><strong>كل فكرة،<br />تصير أوضح.</strong></div>
        <span className={styles.playPreview}>{course.previewReady ? <Play size={20} fill="currentColor" /> : <ArrowLeft size={20} />}<small>{course.previewReady ? "جرّب الشرح" : "اكتشف المادة"}</small></span>
      </Link>
      <div className={styles.courseIdentity}>
        <span><BookOpen size={23} /></span>
        <div><small>{course.university}</small><h2>{course.title}</h2><p>{course.specialty}</p></div>
      </div>
      <div className={styles.courseFacts}>
        <span><small>الدروس</small><strong>{course.lessons.toLocaleString("ar-SA")}</strong></span>
        <span><small>الوصول</small><strong>{course.access}</strong></span>
        <span><small>السعر</small><strong>{course.price.toLocaleString("ar-SA")} ر.س</strong></span>
      </div>
      <div className={styles.courseCanvasActions}>
        <Link href={"/courses/" + course.slug + (course.previewReady ? "#preview" : "")}>
          <ArrowLeft size={16} />
          {course.previewReady ? "شاهد الدرس المجاني" : "استعرض تفاصيل المادة"}
        </Link>
        <Link href="/courses">كل المواد <ArrowLeft size={15} /></Link>
      </div>
    </div>
  );
}

function AiCanvas({ intent }: { intent: Exclude<Intent, "course" | "resume"> }) {
  const isQuiz = intent === "quiz";
  const isSlides = intent === "slides";
  return (
    <div className={styles.aiCanvas}>
      <div className={styles.canvasLabel}><span>مثال توضيحي</span><i /></div>
      <div className={styles.sampleFile}>
        <span><FileText size={20} /></span>
        <div><strong>المحاضرة الرابعة.pdf</strong><small>12 صفحة · ملف نموذجي</small></div>
        <Check size={16} />
      </div>
      {isQuiz ? (
        <div className={styles.quizSample}>
          <small>سؤال 3 من 8</small>
          <strong>أي عبارة تلخّص المفهوم بصورة أدق؟</strong>
          <span><i>A</i> العلاقة تتغير وفق المعطيات</span>
          <span className={styles.correctAnswer}><i>B</i> الإجابة المستندة إلى سياق الملف <Check size={14} /></span>
        </div>
      ) : (
        <div className={styles.outputSample}>
          <header><Sparkles size={16} /><strong>{isSlides ? "مساحة العمل" : "ملخص مركز"}</strong></header>
          <p>ترتب أدوات مراس الأفكار الرئيسية، وتحافظ على المصطلحات العلمية داخل سياقها.</p>
          <ul>
            <li><i /> الفكرة الأساسية في هذا الجزء</li>
            <li><i /> المصطلحات والعلاقات المهمة</li>
            <li><i /> نقاط مناسبة للمراجعة السريعة</li>
          </ul>
        </div>
      )}
      <div className={styles.aiCanvasFooter}>
        <span><Languages size={15} /> عربي وإنجليزي</span>
        <span><ListChecks size={15} /> شرح الإجابات</span>
      </div>
    </div>
  );
}

function ResumeCanvas({ resume }: { resume: NonNullable<ResumeCourse> }) {
  return (
    <div className={styles.resumeCanvas}>
      <div className={styles.canvasLabel}><span>مساحتك الشخصية</span><i /></div>
      <small>آخر مادة فتحتها</small>
      <h2>{resume.title}</h2>
      <p>{resume.lessonTitle}</p>
      <div className={styles.resumeProgress}><i style={{ width: String(resume.progress) + "%" }} /></div>
      <span>{resume.progress.toLocaleString("ar-SA")}٪ من المحتوى المتاح</span>
      <Link href={"/learn/" + resume.slug}>متابعة التعلّم <ArrowLeft size={16} /></Link>
    </div>
  );
}

export function HomeGateway({
  courses,
  institutions,
  featuredCourse,
  resume,
  firstName,
  firstClaim = "أول منصة سعودية رسمية",
  showPayments = true,
}: {
  courses: SearchCourse[];
  institutions: SearchInstitution[];
  featuredCourse?: FeaturedCourse;
  resume?: ResumeCourse;
  firstName?: string;
  firstClaim?: string;
  showPayments?: boolean;
}) {
  const [intent, setIntent] = useState<Intent>(resume ? "resume" : "course");
  const tabs = resume
    ? [{ id: "resume" as const, label: "أكمل درسي", icon: Play }, ...intentMeta]
    : intentMeta;

  return (
    <section className={styles.gateway} aria-labelledby="home-gateway-title">
      <div className={styles.backdrop} aria-hidden="true"><i /><i /><span>✦</span><span>✧</span></div>
      <div className={"container " + styles.layout}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}><Sparkles size={16} aria-hidden="true" /> {firstClaim}</span>
          <h1 id="home-gateway-title">
            {firstName ? "مرحبًا " + firstName + "،" : "هنا، تتّضح الفكرة."}
            <br />
            <em>{firstName ? "نكملها خطوة أبعد؟" : "ويكبر الطموح."}<svg viewBox="0 0 560 20" aria-hidden="true" preserveAspectRatio="none"><path d="M5 13 Q250 -5 555 9" /></svg></em>
          </h1>
          <p>مواد جامعتك بشرح يقرّب البعيد، وأدوات تجعل للمذاكرة معنى جديدًا.<br className={styles.desktopBreak} /> من أول سؤال إلى لحظة الفهم؛ هذه مساحتك في مراس.</p>

          <div className={styles.intentShell}>
            <div className={styles.intentTabs} role="tablist" aria-label="اختر ما تريد إنجازه">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={"home-intent-" + id}
                  tabIndex={intent === id ? 0 : -1}
                  aria-selected={intent === id}
                  aria-controls="home-intent-panel"
                  className={intent === id ? styles.activeIntent : ""}
                  onClick={() => setIntent(id)}
                  onKeyDown={(event) => {
                    const step = event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0;
                    if (!step && event.key !== "Home" && event.key !== "End") return;
                    event.preventDefault();
                    const index = tabs.findIndex((tab) => tab.id === id);
                    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + step + tabs.length) % tabs.length;
                    setIntent(tabs[next].id);
                    document.getElementById("home-intent-" + tabs[next].id)?.focus();
                  }}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
            <div className={styles.composer}>
              {intent === "course" ? (
                <HeroSearch courses={courses} institutions={institutions} />
              ) : intent === "resume" && resume ? (
                <Link className={styles.resumeComposer} href={"/learn/" + resume.slug}>
                  <span><Play size={17} fill="currentColor" /></span>
                  <div><small>متابعة من آخر مادة</small><strong>{resume.title}</strong></div>
                  <ArrowLeft size={18} />
                </Link>
              ) : (
                <AiComposer intent={intent as Exclude<Intent, "course" | "resume">} />
              )}
            </div>
          </div>

          <div className={styles.assurances}>
            <span><Check size={14} /> درس تجريبي قبل الاشتراك</span>
            <span><Check size={14} /> تقدّم محفوظ على أجهزتك</span>
            {showPayments ? <a href="#payment"><Check size={14} /> تابي وتمارا عبر Tap</a> : null}
          </div>
        </div>

        <div className={styles.stage}>
          <div className={styles.orbit} aria-hidden="true"><i /><i /></div>
          <div
          id="home-intent-panel"
          className={styles.canvas}
          role="tabpanel"
          aria-labelledby={"home-intent-" + intent}
          aria-live="polite"
          key={intent}
        >
          {intent === "course" ? <CourseCanvas course={featuredCourse} /> : null}
          {intent === "resume" && resume ? <ResumeCanvas resume={resume} /> : null}
          {intent !== "course" && intent !== "resume" ? <AiCanvas intent={intent} /> : null}
        </div>
          <div className={styles.noteCard}><span><NotebookPen size={20} /></span><small>لحظة فهم تستحق الحفظ</small><strong>فكرة. ملاحظة.<br />ورجعة في وقتها.</strong><i /><i /><i /></div>
          <Link href="/study-tools" className={styles.toolsCard}><span><Sparkles size={19} /></span><div><strong>مذاكرتك، بطريقتك.</strong><small>تلخيص · ترجمة · تدريب</small></div><ArrowLeft size={17} /></Link>
          <span className={styles.stageWord} aria-hidden="true">مساحةٌ لطموحك</span>
        </div>
        <a href="#explore" className={styles.exploreLink}>اكتشف عالم مراس <span><ArrowLeft size={17} /></span></a>
      </div>
    </section>
  );
}
