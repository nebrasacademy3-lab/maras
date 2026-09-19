"use client";
import { useState, useSyncExternalStore } from "react";
import { Search, CircleHelp } from "lucide-react";
import { FAQ_CATEGORIES, type FaqItem } from "@/lib/information-contract";
import styles from "@/app/seo-public.module.css";
const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function PublicFaq({ questions }: { questions: FaqItem[] }) {
  const ready = useSyncExternalStore(subscribeHydration, clientReady, serverReady);
  const [category, setCategory] = useState("all"); const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase("ar");
  const rows = questions.filter(item => (category === "all" || item.category === category) && `${item.question} ${item.answer}`.toLocaleLowerCase("ar").includes(needle));
  return <div className={styles.faqLayout}><aside className={styles.faqFilters} aria-label="تصنيفات الأسئلة"><button disabled={!ready} aria-pressed={category === "all"} onClick={() => setCategory("all")}>جميع الأسئلة <span>{questions.length}</span></button>{Object.entries(FAQ_CATEGORIES).map(([key, label]) => <button disabled={!ready} key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>{label}<span>{questions.filter(item => item.category === key).length}</span></button>)}</aside><section aria-label="الأسئلة والإجابات"><h2>إجابتك أقرب مما تتوقع</h2><label className={styles.faqSearch}><Search size={21} aria-hidden="true"/><input disabled={!ready} value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث عن اشتراك، ملف، إحالة…" aria-label="البحث في الأسئلة الشائعة"/></label><p className={styles.muted} role="status">{rows.length} إجابات {category === "all" ? "في مركز المساعدة" : "في هذا التصنيف"}</p>{rows.map((item, index) => <details id={item.id} className={styles.faq} key={item.id} open={needle ? true : index === 0 ? true : undefined}><summary>{item.question}</summary><p>{item.answer}</p></details>)}{!rows.length && <div className={styles.card}><CircleHelp size={28}/><h3>لم نجد تطابقًا</h3><p>جرّب كلمة أخرى أو اختر كل التصنيفات. يمكنك التواصل مع الدعم لسؤال خاص بحسابك.</p></div>}</section></div>;
}
