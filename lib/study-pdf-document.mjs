import { createHash } from "node:crypto";
import katex from "katex";
import "katex/contrib/mhchem";

export const STUDY_PDF_VERSION = "maras-study-pdf-v1";
export const MAX_PDF_INPUT_CHARS = 100_000;
export const MAX_PDF_BYTES = 8 * 1024 * 1024;
export class StudyPdfError extends Error {
  constructor(code, message = "تعذر تجهيز PDF. تبقى النتيجة النصية محفوظة؛ أعد محاولة التصدير فقط.") { super(message); this.name = "StudyPdfError"; this.code = code; }
}
export function escapePdfHtml(value) {
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export function validatePdfInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new StudyPdfError("PDF_INPUT_INVALID");
  for (const [key, maximum] of [["content", MAX_PDF_INPUT_CHARS], ["title", 500], ["sourceName", 500], ["createdAt", 64]]) {
    if (typeof input[key] !== "string" || input[key].length > maximum || !input[key].trim()) throw new StudyPdfError("PDF_INPUT_INVALID");
  }
  if (!Number.isFinite(Date.parse(input.createdAt))) throw new StudyPdfError("PDF_INPUT_INVALID");
  const brand = input.branding;
  if (!brand || typeof brand !== "object" || typeof brand.description !== "string" || brand.description.length > 2000 || typeof brand.siteUrl !== "string" || typeof brand.whatsapp !== "string" || !Array.isArray(brand.links) || brand.links.length > 12) throw new StudyPdfError("PDF_BRANDING_INVALID");
  const safeUrl = (value) => {
    if (typeof value !== "string" || value.length > 2000 || /[\u0000-\u0020\u007f]/u.test(value)) throw new StudyPdfError("PDF_BRANDING_INVALID");
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname.includes(".") || /^[\d.]+$/.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname) || url.hostname.includes(":")) throw new StudyPdfError("PDF_BRANDING_INVALID");
    return url.href;
  };
  try {
    safeUrl(brand.siteUrl);
    if (brand.whatsapp && !/^[1-9]\d{8,14}$/.test(brand.whatsapp)) throw new StudyPdfError("PDF_BRANDING_INVALID");
    for (const link of brand.links) {
      if (!link || typeof link.label !== "string" || link.label.length > 100 || !link.label.trim()) throw new StudyPdfError("PDF_BRANDING_INVALID");
      safeUrl(link.url);
    }
  } catch { throw new StudyPdfError("PDF_BRANDING_INVALID"); }
  return input;
}
export function pdfInputDigest(input) {
  validatePdfInput(input);
  return createHash("sha256").update(JSON.stringify({ version: STUDY_PDF_VERSION, input })).digest("hex");
}

// Deliberately not a general HTML renderer. Source HTML, scripts, links, SVG and
// images cannot request files/network resources. Only server-approved branding
// becomes a clickable link. Math uses KaTeX's untrusted, bounded mode.
export function studyMarkdownHtml(markdown) {
  if (typeof markdown !== "string" || !markdown.trim() || markdown.length > MAX_PDF_INPUT_CHARS) throw new StudyPdfError("PDF_INPUT_INVALID");
  let mathCount = 0;
  const math = (value, display) => {
    if (++mathCount > 500 || value.length > 4000) throw new StudyPdfError("PDF_MATH_LIMIT");
    if (/\\(?:href|url|includegraphics|htmlClass|htmlStyle|htmlData|htmlId|include|input|def|gdef|newcommand|renewcommand|let|futurelet)\b/.test(value)) throw new StudyPdfError("PDF_MATH_INVALID");
    try {
      const result = katex.renderToString(value, { displayMode: display, throwOnError: true, trust: false, strict: "error", maxExpand: 200, maxSize: 10, output: "htmlAndMathml" });
      if (result.length > 150_000) throw new Error("Math output too large");
      return `<span class="math${display ? " display-math" : ""}" dir="ltr">${result}</span>`;
    } catch { throw new StudyPdfError("PDF_MATH_INVALID", "تعذر تنسيق معادلة في النتيجة. راجع المعادلة قبل تصدير PDF؛ لم تتغير النتيجة المحفوظة."); }
  };
  const inline = (value) => {
    const tokens = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+)\$|`([^`\n]+)`|\*\*([^*\n]+)\*\*|!?\[([^\]\n]+)\]\(([^)\n]*)\)/g;
    let result = "", from = 0;
    for (const token of value.matchAll(tokens)) {
      result += escapePdfHtml(value.slice(from, token.index));
      if (token[1] || token[2]) result += math(token[1] || token[2], true);
      else if (token[3] || token[4]) result += math(token[3] || token[4], false);
      else if (token[5]) result += `<code dir="auto">${escapePdfHtml(token[5])}</code>`;
      else if (token[6]) result += `<strong dir="auto">${escapePdfHtml(token[6])}</strong>`;
      else result += token[0].startsWith("!") ? `<span class="notice">[صورة مشار إليها وغير مضمّنة: ${escapePdfHtml(token[7])}]</span>` : `${escapePdfHtml(token[7])}${token[8] ? ` (${escapePdfHtml(token[8])})` : ""}`;
      from = token.index + token[0].length;
    }
    return result + escapePdfHtml(value.slice(from));
  };
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  const cells = value => value.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, "|"));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^```/.test(line)) {
      const code = [];
      while (++i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i]);
      if (i === lines.length) throw new StudyPdfError("PDF_MARKUP_INCOMPLETE");
      output.push(`<pre dir="auto">${escapePdfHtml(code.join("\n"))}</pre>`); continue;
    }
    if (line === "$$" || line === "\\[") {
      const ending = line === "$$" ? "$$" : "\\]", expression = [];
      while (++i < lines.length && lines[i].trim() !== ending) expression.push(lines[i]);
      if (i === lines.length) throw new StudyPdfError("PDF_MARKUP_INCOMPLETE");
      output.push(`<div class="equation">${math(expression.join("\n"), true)}</div>`); continue;
    }
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const header = cells(line), rows = [];
      i++;
      while (i + 1 < lines.length && lines[i + 1].includes("|")) rows.push(cells(lines[++i]));
      if (header.length > 30 || rows.length > 1000 || rows.some(row => row.length !== header.length)) throw new StudyPdfError("PDF_TABLE_INVALID");
      if (header.length > 6) {
        // Keep every cell and its heading rather than clipping a wide table.
        output.push(`<section class="wide-table"><p class="notice">جدول واسع: عُرضت خلاياه مع عناوينها للحفاظ على قابليتها للقراءة.</p>${rows.map(row => `<div class="record">${row.map((cell, index) => `<p dir="auto"><strong>${inline(header[index])}:</strong> ${inline(cell)}</p>`).join("")}</div>`).join("")}</section>`);
      } else {
        const rtl = /[\u0600-\u06ff]/u.test(header.join(""));
        output.push(`<table dir="${rtl ? "rtl" : "ltr"}"><thead><tr>${header.map(cell => `<th dir="auto">${inline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td dir="auto">${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      }
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { const n = Math.min(4, heading[1].length + 1); output.push(`<h${n} dir="auto">${inline(heading[2])}</h${n}>`); }
    else if (/^[-*_]{3,}$/.test(line)) output.push("<hr>");
    else if (/^[-*+]\s/.test(line)) output.push(`<p class="bullet" dir="auto">• ${inline(line.replace(/^[-*+]\s+/, ""))}</p>`);
    else output.push(`<p dir="auto">${inline(line)}</p>`);
    if (output.length > 10_000) throw new StudyPdfError("PDF_INPUT_INVALID");
  }
  const html = output.join("\n");
  if (html.length > 3_000_000) throw new StudyPdfError("PDF_INPUT_INVALID");
  return html;
}

export function buildStudyPdfDocument(input, assets) {
  validatePdfInput(input);
  const e = escapePdfHtml, brand = input.branding;
  if (!/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(assets.logo) || assets.logo.length > 1_500_000) throw new StudyPdfError("PDF_ASSET_INVALID");
  const date = new Date(input.createdAt).toISOString().slice(0, 10);
  const header = `<div style="font-family:'Noto Sans Arabic','DejaVu Sans',sans-serif;font-size:9px;width:100%;margin:0 16mm;direction:rtl;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #cbd5e1;padding-bottom:8px"><img src="${assets.logo}" style="width:118px;height:48px;object-fit:contain"/><div style="text-align:left;line-height:1.8"><b>مراس العلم · أدوات الدراسة</b><br/><span dir="ltr">${e(new URL(brand.siteUrl).hostname)}</span>${brand.whatsapp ? `<br/><span>واتساب: </span><span dir="ltr">+${e(brand.whatsapp)}</span>` : ""}</div></div>`;
  const footer = `<div style="font-family:'Noto Sans Arabic','DejaVu Sans',sans-serif;font-size:8px;color:#475569;width:100%;margin:0 16mm;display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;padding-top:6px"><span dir="rtl">مراس العلم · للاستخدام الدراسي الشخصي</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
  const body = studyMarkdownHtml(input.content);
  const closing = `<section class="closing" dir="rtl"><img class="closing-logo" src="${assets.logo}" alt="مراس العلم"/><h2>واصل التعلّم مع مراس العلم</h2><p dir="auto">${e(brand.description)}</p><div class="links"><a href="${e(brand.siteUrl)}">زيارة موقع مراس العلم</a>${brand.links.map(link => `<a href="${e(link.url)}">${e(link.label)}</a>`).join("")}</div><p class="notice">المحتوى مساند للدراسة ومولّد آليًا؛ راجعه مع مرجع المقرر. حقوق المصدر محفوظة لأصحابه.</p><p class="version" dir="ltr">${STUDY_PDF_VERSION} · ${pdfInputDigest(input).slice(0, 12)}</p></section>`;
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><title>${e(input.title)}</title><style>${assets.mathCss}
@page{size:A4;margin:35mm 16mm 22mm}*{box-sizing:border-box}html{font-size:11pt}body{margin:0;font-family:'Noto Sans Arabic','Noto Sans','DejaVu Sans',sans-serif;color:#172b46;line-height:1.8;overflow-wrap:anywhere}h1{font-size:23pt;line-height:1.5;margin:0 0 8mm;color:#173e65}h2{font-size:16pt}h3{font-size:13pt}h4{font-size:11.5pt}h2,h3,h4{break-after:avoid;line-height:1.6;margin:6mm 0 2mm}p{margin:0 0 3mm;orphans:3;widows:3}.meta{font-size:9pt;color:#53667b}.notice{font-size:9pt;color:#53667b;line-height:1.8}.intro{border-bottom:2px solid #1d7083;padding-bottom:5mm;margin-bottom:6mm}table{border-collapse:collapse;table-layout:fixed;width:100%;font-size:9pt;margin:5mm 0}thead{display:table-header-group}td,th{border:1px solid #bccbd8;padding:2.5mm;vertical-align:top;overflow-wrap:anywhere;white-space:normal}th{background:#edf3f7;color:#173e65;text-align:start}tr{break-inside:auto}td p:last-child{margin:0}pre{white-space:pre-wrap;font-size:9pt;line-height:1.6;background:#f3f6f8;padding:4mm;overflow-wrap:anywhere}code{font-size:0.92em;white-space:pre-wrap}.math{display:inline-block;max-width:100%;direction:ltr;unicode-bidi:isolate;overflow:visible}.display-math{display:block;text-align:center;margin:3mm 0;break-inside:avoid}.katex{font-size:1.07em}.katex-display{margin:0.5em 0}.katex .katex-mathml{position:absolute;clip:rect(1px,1px,1px,1px);padding:0;border:0;height:1px;width:1px;overflow:hidden}.equation{direction:ltr;break-inside:avoid}hr{border:0;border-top:1px solid #cbd5e1;margin:5mm 0}.record{border-bottom:1px solid #cbd5e1;margin-bottom:4mm}.bullet{padding-inline-start:3mm}.closing{break-before:page;text-align:center;padding-top:12mm}.closing-logo{width:65mm;height:28mm;object-fit:contain;margin-bottom:7mm}.links{display:flex;justify-content:center;flex-wrap:wrap;gap:3mm;margin:8mm 0}.links a{display:block;border:1px solid #bad0db;border-radius:3mm;padding:3mm 5mm;text-decoration:none;color:#17576d;font-size:10pt}.version{font-size:8pt;color:#6b7e91}
</style></head><body><section class="intro"><h1 dir="auto">${e(input.title)}</h1><p class="meta" dir="auto">المصدر: ${e(input.sourceName)}</p><p class="meta">تاريخ النتيجة: <bdi dir="ltr">${e(date)}</bdi></p><p class="notice">نتيجة دراسية محفوظة؛ التصدير لا ينشئ ترجمة أو ملخصًا جديدًا ولا يستدعي Gemini.</p></section><main>${body}</main>${closing}</body></html>`;
  return { html, header, footer };
}
