"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, LoaderCircle, Send, Sparkles, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import type { AssistantAction } from "@/lib/assistant-knowledge";

type Message = { id: number; role: "assistant" | "user"; text: string; actions?: AssistantAction[]; suggestions?: string[] };
const starter: Message = {
  id: 1,
  role: "assistant",
  text: "أهلًا بك في مراس العلم. اسألني عن التسجيل أو جامعتك وتخصصك أو المواد أو الدفع أو المشغل، وسأرشدك بخطوات ورابط مباشر.",
  suggestions: ["ما لقيت مادتي", "كيف أسجل؟", "كيف أجرب درسًا مجانيًا؟"],
};

export function MerasAssistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([starter]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages, open, loading]);
  useEffect(() => {
    const reveal = () => setOpen(true);
    window.addEventListener("meras:assistant", reveal);
    return () => window.removeEventListener("meras:assistant", reveal);
  }, []);

  const ask = async (value: string) => {
    const clean = value.trim();
    if (clean.length < 2 || loading) return;
    const stamp = Date.now();
    setMessages((current) => [...current, { id: stamp, role: "user", text: clean }]);
    setQuestion("");
    setLoading(true);
    try {
      const history = messages.slice(-8).map(({ role, text }) => ({ role, text }));
      const response = await fetch("/api/assistant", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: clean, history }), signal: AbortSignal.timeout(35_000) });
      const result = await response.json().catch(() => ({})) as { answer?: string; actions?: AssistantAction[]; suggestions?: string[]; error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر الرد الآن");
      setMessages((current) => [...current, { id: stamp + 1, role: "assistant", text: result.answer || "كيف أقدر أساعدك؟", actions: result.actions, suggestions: result.suggestions }]);
    } catch (caught) {
      setMessages((current) => [...current, { id: stamp + 1, role: "assistant", text: caught instanceof Error ? caught.message : "تعذر الاتصال بالمساعد. يمكنك فتح الدعم مباشرة.", actions: [{ label: "الدعم", href: "/support" }] }]);
    } finally { setLoading(false); }
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void ask(question); };

  return <div className={`meras-assistant${open ? " is-open" : ""}`}>
    {open && <section className="assistant-panel" aria-label="مساعد مراس" dir="rtl">
      <header><div className="assistant-avatar"><BrandMark /></div><span><small><i /> متصل الآن</small><strong>مساعد مراس</strong><em>دليلك داخل المنصة</em></span><button type="button" onClick={() => setOpen(false)} aria-label="إغلاق المساعد"><X size={19} /></button></header>
      <div className="assistant-trust"><Sparkles size={14} /> اسأل بطريقتك — وسأعطيك الخطوة والرابط</div>
      <div className="assistant-messages" ref={listRef} aria-live="polite">{messages.map((message) => <article className={`assistant-message ${message.role}`} key={message.id}>
        {message.role === "assistant" && <i><Bot size={15} /></i>}<div dir="auto"><p>{message.text}</p>{message.actions?.length ? <nav>{message.actions.map((item) => <Link key={`${item.label}-${item.href}`} href={item.href} onClick={() => setOpen(false)}>{item.label}<ArrowLeft size={13} /></Link>)}</nav> : null}{message.suggestions?.length ? <div className="assistant-suggestions">{message.suggestions.map((item) => <button type="button" key={item} onClick={() => void ask(item)}>{item}</button>)}</div> : null}</div>
      </article>)}{loading && <article className="assistant-message assistant"><i><Bot size={15} /></i><div className="assistant-thinking" role="status"><b>يراجع الكتالوج وسياق حسابك</b><span /><span /><span /></div></article>}</div>
      <form className="assistant-input" onSubmit={submit}><input dir="auto" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} placeholder="اكتب سؤالك هنا..." aria-label="سؤالك للمساعد" /><button type="submit" disabled={loading || question.trim().length < 2} aria-label="إرسال"><Send size={18} /></button></form>
      <footer>لن يطلب منك المساعد كلمة المرور أو بيانات البطاقة</footer>
    </section>}
    <button className="assistant-fab" type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? "إغلاق مساعد مراس" : "فتح مساعد مراس"} aria-expanded={open}>
      <span className="assistant-fab-rings" /><BrandMark /><i>{open ? <X size={17} /> : <span />}</i>{loading && <LoaderCircle size={15} className="spin" />}
    </button>
  </div>;
}
