import { escapePdfHtml as escape, StudyPdfError } from './study-pdf-document.mjs';
const statuses = { draft: 'مسودة / Draft', offered: 'معروض للموافقة / Offered', signed: 'موقّع / Signed', withdrawn: 'مسحوب / Withdrawn', terminated: 'منتهي / Terminated' };
const bounded = (value, max) => typeof value === 'string' && value.length <= max;
export function validateInstructorContractPdf(input) {
  const invalid = () => { throw new StudyPdfError('PDF_INPUT_INVALID'); };
  if (!input || typeof input !== 'object' || JSON.stringify(input).length > 450000) invalid();
  for (const key of ['id', 'version', 'rateHalalas', 'trialDays']) if (!Number.isSafeInteger(input[key]) || input[key] < (key === 'trialDays' ? 0 : 1)) invalid();
  if (!Object.hasOwn(statuses, input.status) || !['hourly', 'course'].includes(input.compensationModel) || input.trialDays > 180) invalid();
  for (const [key, max] of Object.entries({ title: 200, termsAr: 30000, termsEn: 30000, trialTermsAr: 3000, trialTermsEn: 3000, contentHash: 64, signedAt: 40 })) if (!bounded(input[key], max)) invalid();
  if (input.contentHash && !/^[a-f0-9]{64}$/.test(input.contentHash)) invalid();
  for (const object of [input.instructor, input.organization, input.employment]) if (!object || typeof object !== 'object' || Array.isArray(object)) invalid();
  for (const [object, keys] of [[input.instructor, ['fullName','email','phone','country','address']], [input.organization, ['legal_name','legal_address','commercial_registration_number','vat_number','employment_authorization_number']], [input.employment, ['startDate','endDate','workLocation','nationality','paymentTermsAr','paymentTermsEn','benefitsAr','benefitsEn']]]) for (const key of keys) if (!bounded(object[key], 3000)) invalid();
  if (input.employment.compensationStart !== undefined && !['start_date', 'after_trial_approval'].includes(input.employment.compensationStart)) invalid();
  for (const key of ['compensationConditionsAr', 'compensationConditionsEn']) if (input.employment[key] !== undefined && !bounded(input.employment[key], 3000)) invalid();
  if (!Number.isFinite(input.employment.weeklyHours) || input.employment.weeklyHours < 0 || input.employment.weeklyHours > 48) invalid();
  if (input.signature !== null) {
    if (!Array.isArray(input.signature) || input.signature.length > 40) invalid();
    let count = 0;
    for (const stroke of input.signature) {
      if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length > 1500) invalid();
      for (const p of stroke) if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || ++count > 5000) invalid();
    }
    if (count < 12) invalid();
  }
  if (['signed','terminated'].includes(input.status) && (!input.signature || !input.signedAt || !input.contentHash)) invalid();
  return input;
}
const paragraphs = value => value.split(/\n\s*\n|\n/).filter(Boolean).map(p => /^\d{1,2}[.)]\s.{2,100}$/.test(p.trim()) ? `<h3>${escape(p)}</h3>` : `<p>${escape(p)}</p>`).join('');
const field = (name, value) => `<div class="field"><span>${escape(name)}</span><strong dir="auto">${escape(value || '-')}</strong></div>`;
export function buildInstructorContractDocument(raw, assets) {
  const c = validateInstructorContractPdf(raw);
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(assets.logo)) throw new StudyPdfError('PDF_ASSET_INVALID');
  const org = c.organization, e = c.employment, person = c.instructor;
  const signature = c.signature ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 180" role="img" aria-label="Employee signature">${c.signature.map(stroke => `<polyline points="${stroke.map(p => `${(p.x*500).toFixed(2)},${(p.y*180).toFixed(2)}`).join(' ')}" fill="none" stroke="#162c54" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>` : '<p>بانتظار توقيع الشارح / Awaiting employee signature</p>';
  const css = `@page{size:A4}*{box-sizing:border-box}body{margin:0;color:#17223b;font:11px/1.85 "Noto Sans Arabic",Tahoma,Arial,sans-serif;overflow-wrap:anywhere}h1{font-size:20px;line-height:1.65;margin:0 0 4px;color:#163c79}h2{font-size:15px;color:#163c79;margin:20px 0 9px;padding-bottom:6px;border-bottom:1px solid #dde6f1;break-after:avoid}h3{font-size:12px;line-height:1.8;margin:14px 0 8px;break-after:avoid;color:#263c60}p{margin:0 0 10px;orphans:3;widows:3}.eyebrow{color:#58729c;letter-spacing:1px;font:10px Arial}.hero{padding:16px 20px;background:#eff5fc;border-right:4px solid #ce9d42;border-radius:5px;margin-bottom:18px}.status{color:#536581;font-size:10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;padding:12px 16px;border:1px solid #dde6f1;border-radius:7px}.field{break-inside:avoid}.field span{display:block;color:#67768b;font-size:9px}.field strong{display:block;font-weight:600;white-space:pre-wrap}.english{direction:ltr;text-align:left;font-family:Arial,"Noto Sans Arabic",sans-serif;font-size:11.5px}.language{break-before:page}.signature{border:1px solid #cfdbea;border-radius:8px;margin-top:20px;padding:16px;break-inside:avoid}.signature svg{display:block;width:240px;height:87px;max-width:100%;margin:8px auto}.evidence{font:8px/1.7 Arial;direction:ltr;text-align:left;overflow-wrap:anywhere;color:#64748b}.note{color:#586477;font-size:10px}section{max-width:100%}`;
  const englishSummary = `<div class="grid">${field('Employee',person.fullName)}${field('Employer',org.legal_name)}${field('Start / End date',`${e.startDate || '-'} / ${e.endDate || 'Open-ended'}`)}${field('Work location',e.workLocation)}${field('Nationality',e.nationality)}${field('Weekly hours',String(e.weeklyHours))}${field('Compensation',`${(c.rateHalalas/100).toFixed(2)} SAR / ${c.compensationModel === 'hourly' ? 'approved teaching hour' : 'complete approved course'}`)}${field('Probation days',String(c.trialDays))}</div>`;
  const compensationAr = e.compensationStart ? `<h2>بدء التعويض والتقييم</h2><p>${escape(e.compensationStart === "after_trial_approval" ? "يبدأ التعويض المتفق عليه بعد تقييم التجربة واعتماد الاستمرار وفق الشروط المبينة." : "يبدأ التعويض من تاريخ المباشرة وفق شروط الدفع المبينة.")}</p>${paragraphs(e.compensationConditionsAr || "")}` : "";
  const compensationEn = e.compensationStart ? `<h2>Assessment and compensation commencement</h2><p>${escape(e.compensationStart === "after_trial_approval" ? "The agreed compensation starts after probation assessment and approval, under the specified conditions." : "Compensation starts from commencement under the specified payment terms.")}</p>${paragraphs(e.compensationConditionsEn || "")}` : "";
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:;"><title>${escape(c.title)}</title><style>${css}</style></head><body><div class="hero"><div class="eyebrow">MARAS AL ELM · EMPLOYMENT AGREEMENT</div><h1>${escape(c.title).replace(/\s*\|\s*/g, '<br>')}</h1><div class="status">${escape(statuses[c.status])} · العقد ${c.id} · النسخة ${c.version}</div></div><h2>طرفا العقد وبيانات العمل</h2><div class="grid">${field('المنشأة / Employer',org.legal_name)}${field('الموظف الشارح / Employee',person.fullName)}${field('عنوان المنشأة',org.legal_address)}${field('عنوان الموظف',person.address)}${field('البريد الإلكتروني',person.email)}${field('رقم الهاتف',person.phone)}${field('تاريخ المباشرة',e.startDate)}${field('نهاية العقد',e.endDate || 'غير محدد المدة')}${field('الجنسية',e.nationality)}${field('مكان العمل',e.workLocation)}${field('ساعات العمل الأسبوعية',String(e.weeklyHours))}${field('نظام الأجر',`${(c.rateHalalas/100).toFixed(2)} ريال / ${c.compensationModel === 'hourly' ? 'ساعة شرح معتمدة' : 'مادة كاملة معتمدة'}`)}</div>${compensationAr}<h2>دفع الأجر والمزايا</h2>${paragraphs(e.paymentTermsAr)}${paragraphs(e.benefitsAr)}<h2>فترة التجربة: ${c.trialDays} يوم</h2>${paragraphs(c.trialTermsAr)}<h2>بنود عقد العمل</h2>${paragraphs(c.termsAr)}<section class="english language" lang="en" dir="ltr"><h1>Employment agreement</h1><p class="status">Contract ${c.id} · Version ${c.version} · ${escape(statuses[c.status])}</p>${englishSummary}${compensationEn}<h2>Payment and benefits</h2>${paragraphs(e.paymentTermsEn)}${paragraphs(e.benefitsEn)}<h2>Probation: ${c.trialDays} days</h2>${paragraphs(c.trialTermsEn)}<h2>Terms of employment</h2>${paragraphs(c.termsEn)}</section><section class="signature"><h2>توقيع الموظف الشارح / Employee signature</h2>${signature}<p dir="auto">${escape(person.fullName)}${c.signedAt ? ` · <span dir="ltr">${escape(c.signedAt)}</span>` : ''}</p><p class="note">هذا التوقيع مرتبط بجميع بيانات وبنود النسختين العربية والإنجليزية أعلاه. التوثيق الحكومي المطلوب لعقد العمل إجراء مستقل.</p><p class="english note">This signature covers all details and terms in both languages above. Required governmental employment registration remains a separate process.</p><div class="evidence">Document SHA-256: ${escape(c.contentHash || 'Draft - not offered')}<br>Contract ID: ${c.id} / Version: ${c.version}</div></section></body></html>`;
  const base = 'font-family:Tahoma,Arial,sans-serif;color:#4c6080;box-sizing:border-box;width:100%;padding:0 16mm;';
  const header = `<div style="${base}font-size:9px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dce6f2;padding-bottom:9px;"><img src="${assets.logo}" style="width:105px;max-height:40px;object-fit:contain"><div dir="rtl" style="text-align:right">${escape(org.legal_name || 'مراس العلم')}<br>عقد عمل / Employment agreement · ${c.id}-${c.version}</div></div>`;
  const footer = `<div style="${base}font-size:8px;text-align:center;line-height:1.8;"><div dir="rtl">س.ت / CR: ${escape(org.commercial_registration_number || '-')} · ض.ق / VAT: ${escape(org.vat_number || '-')} · سجل الوزارة / Ministry record: ${escape(org.employment_authorization_number || '-')}</div><div dir="ltr">Maras Al Elm · <span class="pageNumber"></span> / <span class="totalPages"></span></div></div>`;
  return { html, header, footer };
}

/** Paged-media version: same validated terms/signature, without browser-only APIs. */
export function buildInstructorContractPagedDocument(raw, assets) {
  const document = buildInstructorContractDocument(raw, assets);
  const css = `@page{size:A4;margin:35mm 16mm 25mm;@top-center{content:element(contractHeader)}@bottom-center{content:element(contractFooter)}}
    .print-header{position:running(contractHeader);width:100%}.print-footer{position:running(contractFooter);width:100%}
    .print-header>div,.print-footer>div{padding-left:0!important;padding-right:0!important}
    .pageNumber:before{content:counter(page)}.totalPages:before{content:counter(pages)}
    .grid{display:block;padding:12px 16px}.field{display:inline-block;vertical-align:top;width:49%;padding:4px 6px;overflow-wrap:break-word;word-wrap:break-word}
    .field strong{white-space:normal;overflow-wrap:break-word}.english{font-family:"DejaVu Sans","Noto Sans Arabic",sans-serif}
    body{overflow-wrap:break-word;word-wrap:break-word}.evidence{font-size:8px;overflow-wrap:break-word}`;
  return document.html.replace(/<strong dir="auto">([^]*?)<\/strong>/g,
    (_match, value) => `<strong dir="${/[\u0600-\u06ff]/.test(value) ? "rtl" : "ltr"}">${value}</strong>`)
    .replace("</style>", css + "</style>").replace("<body>",
    `<body><div class="print-header">${document.header}</div><div class="print-footer">${document.footer}</div>`);
}
