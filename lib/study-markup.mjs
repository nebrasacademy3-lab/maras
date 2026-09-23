// Shared structural parsing: keep scientific delimiters and code inside one cell.
export function studyTableCells(value) {
  const text = value.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  const token = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$[^$\n]+(?<!\\)\$|`[^`\n]+`|\\\||\|/g;
  const cells = []; let from = 0;
  for (const match of text.matchAll(token)) {
    if (match[0] === "|") { cells.push(text.slice(from, match.index).trim().replace(/\\\|/g, "|")); from = match.index + 1; }
  }
  cells.push(text.slice(from).trim().replace(/\\\|/g, "|"));
  return cells;
}
export function studyMarkdownLines(content) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n"), output = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], trimmed = line.trim();
    if (/^```/.test(trimmed)) { fence = !fence; output.push(line); continue; }
    if (fence) { output.push(line); continue; }
    const opening = /^(\$\$|\\\[)/.exec(trimmed);
    const environment = /^\\begin\{(align\*?|aligned|equation\*?|gather\*?|gathered)\}/.exec(trimmed);
    if (!opening && !environment) { output.push(line); continue; }
    const end = opening ? (opening[1] === "$$" ? "$$" : "\\]") : "\\end{" + environment[1] + "}";
    const startLength = opening ? opening[1].length : environment[0].length;
    let combined = trimmed, j = i;
    while (combined.length <= 4000 && combined.indexOf(end, startLength) < 0 && j + 1 < lines.length) combined += "\n" + lines[++j];
    const at = combined.indexOf(end, startLength);
    // Unclosed markup remains visible and the strict PDF renderer rejects it.
    if (at < 0 || combined.slice(at + end.length).trim()) { output.push(line); continue; }
    if (environment) {
      const body = combined.slice(startLength, at);
      const aligned = environment[1].startsWith("gather") ? "gathered" : "aligned";
      combined = "$$\\begin{" + aligned + "}" + body + "\\end{" + aligned + "}$$";
    }
    output.push(combined); i = j;
  }
  return output;
}
