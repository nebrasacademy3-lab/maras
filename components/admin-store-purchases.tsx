"use client";
import { adminFetch } from "@/lib/admin-client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./admin-store-purchases.module.css";
type Data = {
  productPagination: { page: number; pageSize: number; total: number };
  products: { product_key: string; title: string; duration_days: number | null; status: string }[];
  events: { event_type: string; status: string; count: number }[];
  transactions: { id: string; title: string; email: string; store: string; status: string; purchased_at: string; transaction_id: string }[];
  pagination: { page: number; pageSize: number; total: number };
};
export function AdminStorePurchases() {
 const [data, setData] = useState<Data | null>(null), [error, setError] = useState("");
 const [page, setPage] = useState(1), [productPage, setProductPage] = useState(1), [search, setSearch] = useState("");
 const load = useCallback(async (signal: AbortSignal) => {
  const response = await adminFetch("/api/admin/purchases?page=" + page + "&productPage=" + productPage + "&search=" + encodeURIComponent(search), { cache: "no-store", signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "تعذر تحميل السجل");
  if (!signal.aborted) { setData(payload); setError(""); }
 }, [page, productPage, search]);
 useEffect(() => {
  const controller = new AbortController();
  const timer = setTimeout(() => { void load(controller.signal).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "تعذر تحميل السجل"); }); }, 250);
  return () => { clearTimeout(timer); controller.abort(); };
 }, [load]);
 return <main className={styles.page} dir="rtl"><h1>سجل مشتريات التطبيقات السابقة</h1>
  <p className={styles.notice}>أوقف تكامل RevenueCat والشراء داخل التطبيقات. يحتفظ هذا السجل بالمعاملات وحقوق الطلاب السابقة. تتم المشتريات الجديدة عبر الموقع، وتظهر في <Link href="/admin/finance">الإدارة المالية</Link>.</p>
  {error ? <p role="alert">{error} <Link href="/admin/security">التحقق الإداري</Link></p> : null}
  {!data && !error ? <p role="status">جارٍ تحميل السجل…</p> : null}
  <label>البحث في السجل<input aria-label="البحث بالبريد أو المعاملة" placeholder="البريد أو المادة أو رقم معاملة المتجر" value={search} onChange={event => { setSearch(event.target.value); setPage(1); setProductPage(1); }} /></label>
  <section><h2>المعاملات ({data?.pagination.total || 0})</h2>
   {data?.transactions.length === 0 ? <p>لا توجد معاملات مطابقة.</p> : null}
   {data?.transactions.map(transaction => <article className={styles.card} key={transaction.id}><strong>{transaction.title}</strong><Link href={"/admin/students/" + encodeURIComponent(transaction.email)}>{transaction.email}</Link><span>{transaction.store === "app_store" ? "App Store" : "Google Play"}</span><span>{transaction.status === "owned" ? "موثق" : "مسترد"}</span><time>{new Date(transaction.purchased_at).toLocaleString("ar-SA")}</time><code>{transaction.transaction_id}</code></article>)}
   <div className={styles.pager}><button disabled={page === 1} onClick={() => setPage(page - 1)}>السابق</button><span>صفحة {page}</span><button disabled={!data || page * 30 >= data.pagination.total} onClick={() => setPage(page + 1)}>التالي</button></div>
  </section>
  <section><h2>المنتجات السابقة ({data?.productPagination.total || 0})</h2>
   {data?.products.map(product => <article className={styles.card} key={product.product_key}><strong>{product.title}</strong><code>{product.product_key}</code><span>{product.duration_days === null ? "دائم" : product.duration_days + " يومًا"}</span><span>السجل محفوظ · الشراء متوقف</span></article>)}
   <div className={styles.pager}><button disabled={productPage === 1} onClick={() => setProductPage(productPage - 1)}>السابق</button><span>صفحة {productPage}</span><button disabled={!data || productPage * 30 >= data.productPagination.total} onClick={() => setProductPage(productPage + 1)}>التالي</button></div>
  </section>
  <section><h2>أحداث المزود السابقة</h2>{data?.events.map(event => <p key={event.event_type + event.status}>{event.event_type} · {event.status === "processed" ? "عولج" : "يحتاج مراجعة السجل"} · {event.count}</p>)}<p>أي طلب استرداد لمعاملة متجر قديمة يحتاج مراجعة يدوية مع المتجر والدعم؛ توقفت المزامنة الخارجية.</p></section>
 </main>;
}
