"use client";
import Link from "next/link";
import { House, LifeBuoy, RefreshCw } from "lucide-react";
import styles from "./error.module.css";
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className={styles.page} dir="rtl"><section><span className={styles.icon}><LifeBuoy size={32}/></span><p className={styles.eyebrow}>مراس العلم</p><h1>تعذر إكمال هذه الخطوة</h1><p>حدث خطأ أثناء عرض الصفحة. حاول مرة أخرى، أو عد للرئيسية لمتابعة التصفح.</p><div><button className="button button-primary" onClick={()=>retry()}><RefreshCw size={17}/> المحاولة مجددًا</button><Link href="/" className="button button-soft"><House size={17}/> الرئيسية</Link></div><Link href="/contact" className={styles.help}>استمر الخطأ؟ تواصل مع الدعم</Link></section></main>;
}
