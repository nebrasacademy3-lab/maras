import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, orderItems, orders } from "@/db/schema";
import { BrandLogo } from "@/components/brand-logo";
import { InvoicePrintButton } from "@/components/invoice-print-button";
import { getCoursesCatalog } from "@/lib/catalog-store";
import { currentUser } from "@/lib/server-auth";
import styles from "./invoice.module.css";

export const metadata:Metadata={title:"الفاتورة",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
const money=(value:number,currency:string)=>new Intl.NumberFormat("ar-SA",{style:"currency",currency}).format(value);

export default async function InvoicePage({params}:{params:Promise<{orderNumber:string}>}){
  const orderNumber=decodeURIComponent((await params).orderNumber).slice(0,160);
  const user=await currentUser();
  if(!user)redirect(`/login?return_to=${encodeURIComponent(`/invoices/${orderNumber}`)}`);
  const db=getDb();
  const [[invoice],[order],items,courses]=await Promise.all([
    db.select().from(invoices).where(eq(invoices.orderNumber,orderNumber)).limit(1),
    db.select().from(orders).where(eq(orders.orderNumber,orderNumber)).limit(1),
    db.select().from(orderItems).where(eq(orderItems.orderNumber,orderNumber)),
    getCoursesCatalog(true),
  ]);
  if(!invoice||!order)notFound();
  if(user.role!=="admin"&&order.customerEmail.toLowerCase()!==user.email.toLowerCase())redirect("/dashboard?error=forbidden");
  const courseNames=new Map(courses.map((course)=>[course.slug,course.title]));
  return <main className={styles.page}><section className={styles.actions}><Link href={user.role==="admin"?"/admin/finance":"/dashboard?view=orders"}>العودة إلى الطلبات</Link><InvoicePrintButton/></section><article className={styles.invoice}><header><BrandLogo/><div><span>فاتورة ضريبية مبسطة</span><strong dir="ltr">{invoice.invoiceNumber}</strong></div></header><section className={styles.meta}><div><small>رقم الطلب</small><b dir="ltr">{order.orderNumber}</b></div><div><small>تاريخ الإصدار</small><b>{new Date(invoice.issuedAt).toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"})}</b></div><div><small>العملة</small><b dir="ltr">{invoice.currency}</b></div><div><small>الحالة</small><b>{invoice.status==="issued"?"صادرة":invoice.status}</b></div></section><section className={styles.customer}><h2>بيانات العميل</h2><p><span>الاسم</span><b>{order.customerName}</b></p><p><span>البريد</span><b dir="ltr">{order.customerEmail}</b></p>{order.customerPhone&&<p><span>الجوال</span><b dir="ltr">{order.customerPhone}</b></p>}</section><div className={styles.table}><table><thead><tr><th>المادة</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th></tr></thead><tbody>{items.length?items.map((item)=><tr key={item.id}><td>{courseNames.get(item.courseSlug)||item.courseSlug}<small>وصول {item.accessDurationDays} يومًا</small></td><td>{money(item.unitPrice,invoice.currency)}</td><td>{money(item.discount,invoice.currency)}</td><td>{money(item.total,invoice.currency)}</td></tr>):<tr><td>{courseNames.get(order.courseSlug)||order.courseSlug}</td><td>{money(order.subtotal,invoice.currency)}</td><td>{money(order.discount,invoice.currency)}</td><td>{money(order.total,invoice.currency)}</td></tr>}</tbody></table></div><section className={styles.totals}><p><span>قبل الخصم</span><b>{money(order.subtotal,invoice.currency)}</b></p><p><span>الخصم</span><b>{money(order.discount,invoice.currency)}</b></p><p><span>الضريبة المضمنة (15%)</span><b>{money(invoice.taxAmount,invoice.currency)}</b></p><p><span>الإجمالي المدفوع</span><strong>{money(invoice.total,invoice.currency)}</strong></p></section><footer><p>أُنشئت هذه الفاتورة آليًا بعد تأكيد عملية الدفع من مزود الخدمة، وتُحفظ نسخة بياناتها غير القابلة للتعديل ضمن سجل الطلب.</p><small dir="ltr">Meras Al-Elm · {invoice.invoiceNumber}</small></footer></article></main>;
}
