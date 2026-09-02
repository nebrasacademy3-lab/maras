import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { faq } from "@/lib/data";

export function HomeFaq({ title = "كل ما تحتاجه قبل الاشتراك" }: { title?: string }) {
  return <section className="section faq-section" id="faq" aria-labelledby="faq-title" data-home-reveal>
    <div className="container faq-grid">
      <div className="faq-intro">
        <span className="eyebrow"><CircleHelp size={15} /> الأسئلة الشائعة</span>
        <h2 id="faq-title">{title}</h2>
        <p>إجابات مباشرة عن التجربة قبل الدفع، وتفعيل المواد، وصلاحية الوصول، وطلب المواد غير المتوفرة.</p>
        <Link href="/support" className="button button-soft">لم تجد إجابتك؟ تواصل مع الدعم</Link>
      </div>
      <div className="faq-list">
        {faq.map((item, index) => <details key={item.q} className="faq-item" open={index === 0}>
          <summary>{item.q}<span aria-hidden="true">+</span></summary>
          <p>{item.a}</p>
        </details>)}
      </div>
    </div>
  </section>;
}
