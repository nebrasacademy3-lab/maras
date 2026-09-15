import { createDocumentArchive } from "@/lib/document-archive";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function escapeXml(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function run(value: string, bold = false) {
  const rtl = /[\u0600-\u06ff]/.test(value);
  return `<w:r><w:rPr>${bold ? "<w:b/><w:bCs/>" : ""}${rtl ? "<w:rtl/>" : ""}</w:rPr><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;
}
function paragraph(value: string, style = "Normal", align?: string) {
  const rtl = /[\u0600-\u06ff]/.test(value);
  const spans = value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part => run(part.startsWith("**") && part.endsWith("**") ? part.slice(2, -2) : part, part.startsWith("**"))).join("");
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${rtl ? "<w:bidi/>" : ""}<w:jc w:val="${align || "start"}"/></w:pPr>${spans}</w:p>`;
}
function table(rows: string[][]) {
  const count = Math.max(...rows.map(row => row.length));
  const width = Math.floor(9000 / count);
  return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:bidiVisual/><w:tblLayout w:type="fixed"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(edge => `<w:${edge} w:val="single" w:sz="4" w:color="CBD5E1"/>`).join("")}</w:tblBorders><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from({ length: count }, () => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${rows.map((row, i) => `<w:tr>${i === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${Array.from({ length: count }, (_, col) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${i === 0 ? '<w:shd w:fill="EAF1FB"/>' : ""}</w:tcPr>${paragraph(row[col] || "", i === 0 ? "TableHeading" : "TableText")}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`;
}

function contentXml(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || /^```/.test(line)) continue;
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const cells = (value: string) => value.replace(/^\s*\||\|\s*$/g, "").split("|").map(cell => cell.trim());
      const rows = [cells(line)];
      i += 1;
      while (i + 1 < lines.length && lines[i + 1].includes("|")) rows.push(cells(lines[++i]));
      // Excessively wide tables are rendered as paragraphs rather than clipped.
      if (Math.max(...rows.map(row => row.length)) <= 6) output.push(table(rows));
      else output.push(...rows.map(row => paragraph(row.join(" · "))));
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) output.push(paragraph(heading[2], heading[1].length === 1 ? "Heading1" : "Heading2"));
    else if (/^[-*+]\s+/.test(line)) output.push(paragraph(`• ${line.replace(/^[-*+]\s+/, "")}`, "ListText"));
    else if (/^[-*_]{3,}$/.test(line)) continue;
    else output.push(paragraph(line));
  }
  return output.join("");
}

export function createStudyDocx(input: { title: string; content: string; sourceName: string; createdAt: string }) {
  if (!input.content.trim() || input.content.length > 100_000) throw new Error("Invalid study export length");
  const date = /^\d{4}-\d{2}-\d{2}/.exec(input.createdAt)?.[0] || "";
  const main = `${paragraph("مراس العلم | MERAS AL ELM", "Brand")}${paragraph(input.title, "Title")}${paragraph(`المصدر: ${input.sourceName}`, "Subtitle")}${paragraph(`تاريخ الإنشاء: ${date}`, "Subtitle")}${paragraph("مادة مساندة مولدة بالذكاء الاصطناعي؛ راجعها مع مرجع المقرر ولا تعتمد عليها وحدها.", "Notice")}${contentXml(input.content)}`;
  const style = (id: string, size: number, color: string, bold = false) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="${id.startsWith("Heading") ? 240 : 0}" w:after="140"/>${["Title", "Heading1", "Heading2"].includes(id) ? "<w:keepNext/>" : ""}</w:pPr><w:rPr><w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${bold ? "<w:b/><w:bCs/>" : ""}</w:rPr></w:style>`;
  return createDocumentArchive({
    "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>`,
    "_rels/.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="${R}/styles" Target="styles.xml"/><Relationship Id="footer" Type="${R}/footer" Target="footer1.xml"/><Relationship Id="header" Type="${R}/header" Target="header1.xml"/></Relationships>`,
    "word/document.xml": `${XML}<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${main}<w:sectPr><w:headerReference w:type="default" r:id="header"/><w:footerReference w:type="default" r:id="footer"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1250" w:right="1350" w:bottom="1300" w:left="1350" w:header="600" w:footer="600"/></w:sectPr></w:body></w:document>`,
    "word/styles.xml": `${XML}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="330" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${style("Title", 38, "17345B", true)}${style("Brand", 24, "245FB3", true)}${style("Subtitle", 20, "54657A")}${style("Notice", 18, "54657A")}${style("Heading1", 30, "17345B", true)}${style("Heading2", 26, "245FB3", true)}${style("ListText", 24, "172033")}${style("TableHeading", 21, "17345B", true)}${style("TableText", 21, "172033")}</w:styles>`,
    "word/header1.xml": `${XML}<w:hdr xmlns:w="${W}">${paragraph("مراس العلم · أدوات الدراسة", "Subtitle")}</w:hdr>`,
    "word/footer1.xml": `${XML}<w:ftr xmlns:w="${W}">${paragraph("إعداد وتنسيق: مراس العلم · marasalelm.com", "Notice", "center")}${paragraph("حقوق محتوى المصدر محفوظة لأصحابه. للاستخدام الدراسي الشخصي.", "Notice", "center")}<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:fldSimple w:instr="PAGE"/></w:p></w:ftr>`,
  });
}
