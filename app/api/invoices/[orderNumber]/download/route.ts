import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, orderItems, orders } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { getCoursesCatalog } from "@/lib/catalog-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const escapeHtml = (value:unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[character] || character));
const money = (value:number,currency:string) => new Intl.NumberFormat("ar-SA",{style:"currency",currency}).format(value || 0);

export async function GET(request:Request,{params}:{params:Promise<{orderNumber:string}>}) {
  const user=await getSessionUser(request);
  if(!user)return jsonError("سجّل الدخول لتحميل الفاتورة",401);
  const orderNumber=decodeURIComponent((await params).orderNumber).trim().slice(0,160);
  if(!orderNumber)return jsonError("رقم الطلب غير صالح",400);
  const db=getDb();
  const [[invoice],[order],items,courses]=await Promise.all([
    db.select().from(invoices).where(eq(invoices.orderNumber,orderNumber)).limit(1),
    db.select().from(orders).where(eq(orders.orderNumber,orderNumber)).limit(1),
    db.select().from(orderItems).where(eq(orderItems.orderNumber,orderNumber)),
    getCoursesCatalog(true),
  ]);
  if(!invoice||!order)return jsonError("الفاتورة غير موجودة",404);
  if(user.role!=="admin"&&order.customerEmail.toLowerCase()!==user.email.toLowerCase())return jsonError("غير مصرح بتحميل هذه الفاتورة",403);
  const currency=/^[A-Z]{3}$/.test(invoice.currency)?invoice.currency:"SAR";
  const courseNames=new Map(courses.map((course)=>[course.slug,course.title]));
  const rows=(items.length?items:[{id:0,courseSlug:order.courseSlug,unitPrice:order.subtotal,discount:order.discount,total:order.total,accessDurationDays:0}]).map((item)=>`<tr><td>${escapeHtml(courseNames.get(item.courseSlug)||item.courseSlug)}${item.accessDurationDays?`<small>وصول ${item.accessDurationDays} يومًا</small>`:""}</td><td>${escapeHtml(money(item.unitPrice,currency))}</td><td>${escapeHtml(money(item.discount,currency))}</td><td>${escapeHtml(money(item.total,currency))}</td></tr>`).join("");
  const document=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>فاتورة ${escapeHtml(invoice.invoiceNumber)}</title><style>body{margin:0;padding:24px;background:#f5f7fb;color:#152033;font-family:Tahoma,Arial,sans-serif}.page{max-width:820px;margin:auto;padding:32px;border:1px solid #e3e7ef;border-radius:22px;background:#fff}header,.meta,.customer p,.total p{display:flex;align-items:center;justify-content:space-between;gap:16px}header{padding-bottom:22px;border-bottom:2px solid #eef1f6}header h1{margin:0;color:#5b31d1;font-size:28px}header strong{font-size:18px}.meta{display:grid;grid-template-columns:repeat(2,1fr);margin:22px 0;padding:16px;border-radius:14px;background:#f7f5ff}.meta div{display:grid;gap:5px}.meta small,.customer span,.total span{color:#667085}.customer{padding:0 0 18px}.customer h2{font-size:17px}.customer p{margin:7px 0}table{width:100%;border-collapse:collapse}th,td{padding:12px;border-bottom:1px solid #e8ebf1;text-align:right}th{color:#667085;background:#f8fafc;font-size:12px}td small{display:block;margin-top:4px;color:#667085}.total{width:min(360px,100%);margin:22px 0 0 auto}.total p{margin:7px 0}.total .grand{padding-top:12px;border-top:2px solid #e6e8ee;color:#5b31d1;font-size:18px}footer{margin-top:28px;padding-top:16px;border-top:1px solid #e7eaf0;color:#667085;font-size:11px;line-height:1.8}@media(max-width:600px){body{padding:8px}.page{padding:18px}.meta{grid-template-columns:1fr}th,td{padding:8px;font-size:11px}}@media print{body{padding:0;background:#fff}.page{border:0;box-shadow:none}}</style></head><body><main class="page"><header><div><h1>مراس العلم</h1><span>فاتورة ضريبية مبسطة</span></div><strong>${escapeHtml(invoice.invoiceNumber)}</strong></header><section class="meta"><div><small>رقم الطلب</small><b>${escapeHtml(order.orderNumber)}</b></div><div><small>تاريخ الإصدار</small><b>${escapeHtml(new Date(invoice.issuedAt).toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"}))}</b></div><div><small>العملة</small><b>${escapeHtml(currency)}</b></div><div><small>الحالة</small><b>${invoice.status==="issued"?"صادرة":escapeHtml(invoice.status)}</b></div></section><section class="customer"><h2>بيانات العميل</h2><p><span>الاسم</span><b>${escapeHtml(order.customerName)}</b></p><p><span>البريد</span><b>${escapeHtml(order.customerEmail)}</b></p>${order.customerPhone?`<p><span>الجوال</span><b>${escapeHtml(order.customerPhone)}</b></p>`:""}</section><table><thead><tr><th>المادة</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table><section class="total"><p><span>قبل الخصم</span><b>${escapeHtml(money(order.subtotal,currency))}</b></p><p><span>الخصم</span><b>${escapeHtml(money(order.discount,currency))}</b></p><p><span>الضريبة المضمنة (15%)</span><b>${escapeHtml(money(invoice.taxAmount,currency))}</b></p><p class="grand"><span>الإجمالي المدفوع</span><strong>${escapeHtml(money(invoice.total,currency))}</strong></p></section><footer>أُنشئت هذه النسخة آليًا بعد تأكيد الدفع، وهي مخصصة للعرض والطباعة والحفظ من جهازك. رقم المرجع: ${escapeHtml(invoice.invoiceNumber)}</footer></main></body></html>`;
  const safeNumber=invoice.invoiceNumber.replace(/[^A-Za-z0-9._-]/g,"-").slice(0,100)||"invoice";
  return new Response(document,{headers:{"content-type":"text/html; charset=utf-8","content-disposition":`attachment; filename="${safeNumber}.html"`,"cache-control":"private, no-store, max-age=0","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; img-src data:"}});
}
