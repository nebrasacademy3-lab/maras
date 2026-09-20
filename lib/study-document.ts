import { posix } from "node:path";
import { DocumentFormatError, openDocumentArchive } from "@/lib/document-archive";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const MAX_SOURCE_TEXT_CHARS = 60_000;

export function decodeXmlText(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (!entity.startsWith("#")) return named[entity] || "";
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isInteger(code) && code >= 0x20 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : " ";
  });
}

function attributes(tag: string) {
  return Object.fromEntries([...tag.matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(match => [match[1], decodeXmlText(match[3])]));
}

export function xmlText(xml: string) {
  // Do not count comments, field instructions, deleted revisions or alt-text as lesson facts.
  const content = xml.replace(/<!--[\s\S]*?-->/g, "").replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, "");
  const tokens = content.match(/<(?:w|a|m):t(?:\s[^>]*)?>[\s\S]*?<\/(?:w|a|m):t>|<(?:w|a):(?:tab|br)\b[^>]*\/>|<\/(?:w|a):(?:p|tr|tc)>/g) || [];
  return tokens.map(token => {
    if (token.startsWith("</")) return token.endsWith(":tc>") ? "\t" : "\n";
    if (/<(?:w|a):tab\b/.test(token)) return "\t";
    if (/<(?:w|a):br\b/.test(token)) return "\n";
    return decodeXmlText(token.replace(/^<[^>]+>|<\/[^>]+>$/g, ""));
  }).join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Text-only OOXML extraction. Diagrams/handwriting require a PDF/image, never silent OCR. */
export function studyDocumentText(bytes: Buffer, contentType: string): string | null {
  let text: string;
  if (contentType === "text/plain" || contentType === "text/markdown") {
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new DocumentFormatError("احفظ الملف النصي بترميز UTF-8 ثم أعد رفعه."); }
    if (text.includes("\u0000")) throw new DocumentFormatError();
  } else if (contentType === DOCX_MIME || contentType === PPTX_MIME) {
    const zip = openDocumentArchive(bytes);
    if (zip.names.some(name => /vbaProject\.bin$/i.test(name))) throw new DocumentFormatError("الملفات المحتوية على وحدات ماكرو غير مدعومة.");
    const types = zip.text("[Content_Types].xml");
    if (contentType === DOCX_MIME) {
      if (!types.includes("wordprocessingml.document.main+xml")) throw new DocumentFormatError();
      const main = zip.text("word/document.xml");
      if (!/<w:document\b/.test(main) || !main.includes("</w:document>")) throw new DocumentFormatError();
      text = [xmlText(main), xmlText(zip.text("word/footnotes.xml", false)), xmlText(zip.text("word/endnotes.xml", false))].filter(Boolean).join("\n\n");
    } else {
      if (!types.includes("presentationml.presentation.main+xml")) throw new DocumentFormatError();
      const presentation = zip.text("ppt/presentation.xml");
      const relationships = zip.text("ppt/_rels/presentation.xml.rels");
      const targets = new Map<string, string>();
      for (const match of relationships.matchAll(/<Relationship\b[^>]*\/?\s*>/g)) {
        const attrs = attributes(match[0]);
        if (!attrs.Type?.endsWith("/slide") || attrs.TargetMode === "External") continue;
        const path = posix.normalize(posix.join("ppt", attrs.Target || ""));
        if (!/^ppt\/slides\/[^/]+\.xml$/.test(path) || !attrs.Id || targets.has(attrs.Id)) throw new DocumentFormatError();
        targets.set(attrs.Id, path);
      }
      const slides = [...presentation.matchAll(/<p:sldId\b[^>]*\/?\s*>/g)];
      if (!slides.length || slides.length > 400) throw new DocumentFormatError("قسّم العرض إلى أجزاء أصغر قبل استخدام الأدوات.");
      let meaningfulChars = 0;
      text = slides.map((match, index) => {
        const path = targets.get(attributes(match[0])["r:id"]);
        if (!path) throw new DocumentFormatError();
        const slide = xmlText(zip.text(path));
        meaningfulChars += slide.length;
        return `الشريحة ${index + 1}\n${slide || "[شريحة دون نص قابل للاستخراج؛ لا تستنتج محتواها]"}`;
      }).join("\n\n");
      if (meaningfulChars < 20) throw new DocumentFormatError("الشرائح لا تحتوي نصًا كافيًا قابلًا للاستخراج. صدّرها إلى PDF ليُقرأ محتواها المصوّر.");
    }
  } else return null;
  text = text.trim();
  if (text.length < 20) throw new DocumentFormatError("الملف لا يحتوي نصًا كافيًا. ارفع نسخة PDF أو صورة واضحة للمحتوى المصوّر.");
  if (text.length > MAX_SOURCE_TEXT_CHARS) throw new DocumentFormatError(`النص أكبر من حد المعالجة (${MAX_SOURCE_TEXT_CHARS.toLocaleString("ar-SA")} حرف). قسّم الملف؛ لن نحذف جزءًا منه تلقائيًا.`);
  return text;
}
