import katex from "katex";
import "katex/contrib/mhchem";
export const MAX_RICH_TEXT = 100000;
export const escapeRichHtml = value => String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** No raw HTML, images or active links. Math cannot load URLs or define unbounded macros. */
export function richStudyHtml(content, mathml = false) {
  if (typeof content !== "string" || content.length > MAX_RICH_TEXT) return '<p>المحتوى أكبر من حد العرض الآمن. افتح الملف المحفوظ لقراءته كاملًا.</p>';
  const escape = escapeRichHtml; let count = 0;
  const math = (expression, display) => {
    const plain = `<code class="math-source" dir="ltr">${escape(expression)}</code>`;
    if (++count > 500 || expression.length > 4000 || /\\(?:href|url|includegraphics|htmlClass|htmlStyle|htmlData|htmlId|include|input|def|gdef|newcommand|renewcommand|let|futurelet)\b/.test(expression)) return plain;
    try {
      const html = katex.renderToString(expression, { displayMode: display, trust: false, throwOnError: true, strict: "ignore", maxExpand: 200, maxSize: 10, output: mathml ? "mathml" : "htmlAndMathml" });
      return html.length < 150000 ? `<span class="math ${display ? "display-math" : ""}" dir="ltr">${html}</span>` : plain;
    } catch { return plain; }
  };
  const inline = (value, depth = 0) => {
    if (depth > 8) return escape(value);
    const pattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+)\$|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|!?\[([^\]\n]+)\]\(([^)\n]*)\)/g;
    let result = "", from = 0;
    for (const t of value.matchAll(pattern)) {
      result += escape(value.slice(from, t.index));
      if (t[1] || t[2]) result += math(t[1] || t[2], true);
      else if (t[3] || t[4]) result += math(t[3] || t[4], false);
      else if (t[5]) result += `<code dir="auto">${escape(t[5])}</code>`;
      else if (t[6]) result += `<strong>${inline(t[6], depth + 1)}</strong>`;
      else if (t[7]) result += `<em>${inline(t[7], depth + 1)}</em>`;
      else result += escape(t[8]);
      from = t.index + t[0].length;
    }
    return result + escape(value.slice(from));
  };
  const lines = content.replace(/\r\n?/g, "\n").split("\n"), out = [];
  const cells = v => v.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, "|"));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line) continue;
    if (/^```/.test(line)) {
      const code = []; while (++i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i]);
      out.push(`<pre dir="ltr"><code>${escape(code.join("\n"))}</code></pre>`); continue;
    }
    if (line === "$$" || line === "\\[") {
      const end = line === "$$" ? "$$" : "\\]", expression = [];
      while (++i < lines.length && lines[i].trim() !== end) expression.push(lines[i]);
      out.push(`<div class="equation">${math(expression.join("\n"), true)}</div>`); continue;
    }
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const head = cells(line), rows = []; i++;
      while (i + 1 < lines.length && lines[i + 1].includes("|")) rows.push(cells(lines[++i]));
      if (head.length <= 30 && rows.length <= 1000) out.push(`<div class="table-scroll" tabindex="0" role="region" aria-label="جدول قابل للتمرير"><table dir="${/[\u0600-\u06ff]/.test(head.join("")) ? "rtl" : "ltr"}"><thead><tr>${head.map(v => `<th dir="auto">${inline(v)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(v => `<td dir="auto">${inline(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      else out.push(`<pre>${escape([line, ...rows.map(r => r.join(" | "))].join("\n"))}</pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.+)$/.exec(line);
    if (h) { const n = Math.min(6, h[1].length + 1); out.push(`<h${n} dir="auto">${inline(h[2])}</h${n}>`); }
    else if (/^[-*_]{3,}$/.test(line)) out.push('<hr>');
    else if (/^>\s?/.test(line)) out.push(`<blockquote dir="auto">${inline(line.replace(/^>\s?/, ""))}</blockquote>`);
    else out.push(`<p dir="auto">${inline(line.replace(/^[-*+]\s+/, "• "))}</p>`);
  }
  const html = out.join("\n");
  return html.length <= 3000000 ? html : `<pre dir="auto">${escape(content)}</pre>`;
}
export const richStudyCss = `*{box-sizing:border-box}body{margin:0;padding:2px;font-family:system-ui,-apple-system,'Noto Sans Arabic',Tahoma,sans-serif;font-size:16px;line-height:1.95;overflow-wrap:anywhere}p{margin:.35em 0 .75em}h2,h3,h4,h5,h6{line-height:1.55;margin:1em 0 .5em}pre,code{font-family:ui-monospace,monospace;font-size:.92em}pre{white-space:pre;overflow:auto;padding:12px;border:1px solid currentColor;border-radius:12px}code{white-space:pre-wrap}.math{display:inline-block;max-width:100%;overflow-x:auto;vertical-align:middle}.display-math,.equation{display:block;text-align:center;overflow-x:auto;max-width:100%;margin:.8em 0;padding:.25em}.math-source{white-space:pre-wrap}.table-scroll{max-width:100%;overflow-x:auto}table{border-collapse:collapse;min-width:100%;font-size:.92em}th,td{border:1px solid #9aa5b5;padding:9px;min-width:110px;vertical-align:top}blockquote{margin:12px 0;padding:8px 16px;border-inline-start:3px solid #6e81ba}hr{border:0;border-top:1px solid #9aa5b5;margin:20px 0}math{font-family:math}math[display=block]{overflow-x:auto;display:block}.katex{max-width:100%}`;
