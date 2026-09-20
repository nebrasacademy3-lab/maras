import { createHash } from "node:crypto";
import { posix } from "node:path";
import { DocumentFormatError, openDocumentArchive } from "@/lib/document-archive";
import { decodeXmlText, DOCX_MIME, PPTX_MIME, xmlText } from "@/lib/study-document";

export const STUDY_PLAN_VERSION = 1;
export const MAX_STUDY_UNITS = 4096;
export const MAX_STUDY_TEXT = 2_000_000;
export const MAX_STUDY_RESULT = 4_000_000;
export const PART_TARGET_CHARS = 6000;
export type StudyUnit = { id: string; label: string; text?: string; page?: number };
export type StudyPartInput = { units: StudyUnit[]; mode: "whole" | "units"; contentType: string; sourcePages?: number };
export type StudyPlan = { version: 1; sourceSha256: string; fingerprint: string; configHash: string; sourceUnits: string[]; sourcePages?: number; mode: "whole" | "units"; cacheKey: string; action: "summary" | "translation" | "quiz" };
export class StudyPlanError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "StudyPlanError"; }
}
export function studyBytesHash(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
export function studyHash(value: unknown) { return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex"); }
export function studySourceFingerprint(source: { cacheScope: string; cacheVersion: string; objectKey: string; storageProvider: string; contentType: string; sizeBytes: number; originalName: string; scanSha256?: string | null }) {
  return studyHash({ scope: source.cacheScope, version: source.cacheVersion, key: source.objectKey, provider: source.storageProvider, type: source.contentType, bytes: source.sizeBytes, name: source.originalName, scan: source.scanSha256 || null });
}
export function studyConfigHash(config: { model: string; instructions: string; temperature: number; maxOutputTokens: number }) {
  return studyHash({ model: config.model, instructions: config.instructions, temperature: config.temperature, maxOutputTokens: config.maxOutputTokens, prompt: STUDY_PLAN_VERSION });
}
function attrs(tag: string) { return Object.fromEntries([...tag.matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(m => [m[1], decodeXmlText(m[3])])); }
function review(label: string) { throw new StudyPlanError("AI_DOCUMENT_REVIEW_REQUIRED", `يحتوي ${label} على رسم أو بنية علمية لا يمكن حفظها باستخراج النص وحده. صدّر نسخة PDF؛ لم تُحذف هذه العناصر ولم يبدأ التوليد.`); }
function officeText(xml: string, label: string) {
  const visible = xml.replace(/<!--[\s\S]*?-->/g, "").replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, "");
  // These elements carry meaning not represented by plain text. Never silently
  // flatten equations, merged tables, images, charts or raised/lowered runs.
  if (/<(?:m:oMath|w:(?:drawing|pict|object|altChunk|vertAlign|gridSpan|vMerge)|a:(?:blip|graphic)|p:(?:pic|graphicFrame|oleObj))\b/.test(visible)
      || /\bbaseline\s*=\s*["'](?!0["'])/.test(visible)) review(label);
  return xmlText(visible.replace(/<w:(footnote|endnote)Reference\b[^>]*\/?\s*>/g, tag => {
    const id = attrs(tag)["w:id"]; return id && /^-?\d+$/.test(id) ? `<w:t> [${id}] </w:t>` : "";
  }));
}
function wordBlocks(xml: string, label: string): string[] {
  const source = xml.replace(/<!--[\s\S]*?-->/g, "").replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, "");
  const blocks: string[] = [], stack: string[] = []; let start = -1;
  for (const match of source.matchAll(/<\/?w:(p|tbl)\b[^>]*>/g)) {
    const tag = match[0], kind = match[1], closing = tag.startsWith("</"), empty = /\/\s*>$/.test(tag);
    if (!closing) { if (!stack.length) start = match.index!; if (!empty) stack.push(kind); else if (!stack.length) blocks.push(tag); }
    else {
      if (stack.pop() !== kind) throw new DocumentFormatError(`بنية غير مكتملة في ${label}.`);
      if (!stack.length && start >= 0) { blocks.push(source.slice(start, match.index! + tag.length)); start = -1; }
    }
  }
  if (stack.length) throw new DocumentFormatError(`بنية غير مكتملة في ${label}.`);
  // Catch unsupported objects even when outside a paragraph/table.
  officeText(source, label);
  return blocks;
}
/** Full, bounded text extraction. Labels are structural locations, never invented Word pages. */
export function studyTextUnits(bytes: Buffer, contentType: string): StudyUnit[] | null {
  const units: StudyUnit[] = [];
  const add = (id: string, label: string, text: string) => { if (text.trim()) units.push({ id, label, text: text.trim() }); };
  if (["text/plain", "text/markdown"].includes(contentType)) {
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new DocumentFormatError("احفظ الملف النصي بترميز UTF-8."); }
    if (text.includes("\u0000") || text.length > MAX_STUDY_TEXT) throw new StudyPlanError("AI_DOCUMENT_PLAN_LIMIT", "تجاوز النص حد المعالجة الآمنة أو احتوى ترميزًا غير صالح؛ لم يُقص المصدر.");
    // Blank lines delimit paragraphs, but not a fenced code/math block or table.
    const lines = text.split(/\r?\n/); let block: string[] = [], fence: string | null = null, ordinal = 0;
    const flush = () => { if (block.join("\n").trim()) { ordinal++; add(`text:${ordinal}`, `المقطع ${ordinal}`, block.join("\n")); } block = []; };
    for (const line of lines) {
      const marker = /^\s*(`{3,}|~{3,}|\$\$)\s*/.exec(line)?.[1];
      if (marker) { if (!fence) fence = marker; else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null; }
      if (!line.trim() && !fence) flush(); else block.push(line);
    }
    flush();
    if (fence) throw new StudyPlanError("AI_DOCUMENT_REVIEW_REQUIRED", "يوجد مقطع شيفرة أو معادلة غير مغلق؛ راجع المصدر قبل التوليد.");
  } else if (contentType === DOCX_MIME || contentType === PPTX_MIME) {
    const zip = openDocumentArchive(bytes);
    if (zip.names.some(name => /vbaProject\.bin$/i.test(name))) throw new DocumentFormatError("الملفات المحتوية على وحدات ماكرو غير مدعومة.");
    const types = zip.text("[Content_Types].xml");
    if (contentType === DOCX_MIME) {
      if (!types.includes("wordprocessingml.document.main+xml")) throw new DocumentFormatError();
      const main = zip.text("word/document.xml");
      if (!/<w:document\b/.test(main) || !main.includes("</w:document>")) throw new DocumentFormatError();
      const paths = ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml", ...zip.names.filter(name => /^word\/(?:header|footer)\d+\.xml$/.test(name)).sort()];
      for (const path of paths) {
        const label = path === "word/document.xml" ? "متن Word" : path === "word/footnotes.xml" ? "حواشي Word" : path === "word/endnotes.xml" ? "ملاحظات Word الختامية" : `ترويسة/تذييل Word (${path.split("/").at(-1)})`;
        const xml = zip.text(path, path === "word/document.xml");
        for (const [index, block] of wordBlocks(xml, label).entries()) add(`${path}:${index + 1}`, `${label}، العنصر ${index + 1}`, officeText(block, label));
      }
    } else {
      if (!types.includes("presentationml.presentation.main+xml")) throw new DocumentFormatError();
      const presentation = zip.text("ppt/presentation.xml"), relationships = zip.text("ppt/_rels/presentation.xml.rels"), targets = new Map<string, string>();
      for (const m of relationships.matchAll(/<Relationship\b[^>]*\/?\s*>/g)) {
        const a = attrs(m[0]); if (!a.Type?.endsWith("/slide") || a.TargetMode === "External") continue;
        const path = posix.normalize(posix.join("ppt", a.Target || ""));
        if (!/^ppt\/slides\/[^/]+\.xml$/.test(path) || !a.Id || targets.has(a.Id)) throw new DocumentFormatError();
        targets.set(a.Id, path);
      }
      const slides = [...presentation.matchAll(/<p:sldId\b[^>]*\/?\s*>/g)];
      if (!slides.length || slides.length > 400) throw new StudyPlanError("AI_DOCUMENT_PLAN_LIMIT", "حد العرض الآمن 400 شريحة؛ لم يُحذف أي جزء من المصدر.");
      for (const [index, slide] of slides.entries()) {
        const path = targets.get(attrs(slide[0])["r:id"]); if (!path) throw new DocumentFormatError();
        const label = `الشريحة ${index + 1}`, text = officeText(zip.text(path), label);
        if (!text.trim()) review(label);
        add(`slide:${index + 1}`, label, text);
      }
    }
  } else return null;
  const length = units.reduce((sum, unit) => sum + (unit.text?.length || 0), 0);
  if (!units.length || length < 20) throw new DocumentFormatError("لا يوجد نص كافٍ للمعالجة. ارفع PDF واضحًا للمحتوى المصوّر.");
  if (length > MAX_STUDY_TEXT || units.length > MAX_STUDY_UNITS) throw new StudyPlanError("AI_DOCUMENT_PLAN_LIMIT", "تجاوز المصدر حد الوحدات/النص الآمن؛ لم يُقص أو يُرسل إلى التوليد.");
  return units;
}
export function groupStudyUnits(units: StudyUnit[], contentType: string, sourcePages?: number): StudyPartInput[] {
  if (!units.length || units.length > MAX_STUDY_UNITS || new Set(units.map(u => u.id)).size !== units.length) throw new StudyPlanError("AI_PLAN_INVALID", "خريطة المصدر غير صالحة.");
  const result: StudyPartInput[] = []; let current: StudyUnit[] = [], size = 0;
  const flush = () => { if (current.length) result.push({ units: current, mode: "units", contentType, ...(sourcePages ? { sourcePages } : {}) }); current = []; size = 0; };
  for (const unit of units) {
    const length = unit.text?.length || 0;
    // The unit, not an arbitrary character offset, is the smallest safe retry.
    if (length > 48_000) throw new StudyPlanError("AI_DOCUMENT_REVIEW_REQUIRED", `${unit.label} كبير ولا يملك فاصلًا بنيويًا آمنًا. لم نفصل الجدول أو المعادلة أو نقتطع نهايته.`);
    if (current.length && (size + length > PART_TARGET_CHARS || (sourcePages && current.length >= 4))) flush();
    current.push(unit); size += length;
  }
  flush();
  if (result.length > 2048) throw new StudyPlanError("AI_DOCUMENT_PLAN_LIMIT", "عدد أجزاء المعالجة يتجاوز الحد الآمن.");
  if (result.length === 1) result[0].mode = "whole";
  return result;
}
export function splitStudyPart(part: StudyPartInput): [StudyPartInput, StudyPartInput] {
  if (part.units.length < 2) throw new StudyPlanError("AI_DOCUMENT_REVIEW_REQUIRED", `${part.units[0]?.label || "الوحدة"} تجاوزت حد النموذج ولا يمكن تقسيمها دون فقد بنيتها. الأجزاء السابقة محفوظة.`);
  const middle = Math.ceil(part.units.length / 2);
  return [{ ...part, mode: "units", units: part.units.slice(0, middle) }, { ...part, mode: "units", units: part.units.slice(middle) }];
}
export function assertStudyCoverage(expected: string[], parts: StudyPartInput[]) {
  const actual = parts.flatMap(part => part.units.map(u => u.id));
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index]) || new Set(actual).size !== actual.length) throw new StudyPlanError("AI_PLAN_COVERAGE", "خريطة الأجزاء تحتوي تكرارًا أو فجوة؛ لم تُنشر نتيجة نهائية.");
}
export function checkedStudyJson<T>(value: string, hash: string): T {
  if (studyHash(value) !== hash) throw new StudyPlanError("AI_CHECKPOINT_CORRUPT", "تغيّرت بصمة نقطة الحفظ؛ أوقفنا التجميع دون استعمال نتيجة تالفة.");
  return JSON.parse(value) as T;
}
