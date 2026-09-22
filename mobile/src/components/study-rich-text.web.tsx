import React, { memo, useMemo } from "react";
import { richStudyHtml, richStudyCss } from "@/src/lib/study-rich-text.mjs";
import { useTheme } from "@/src/providers/ThemeProvider";
/** MathML is native to modern browser engines; no iframe, external assets or scripts. */
export const StudyRichText = memo(function StudyRichText({ content }: { content: string }) {
  const { colors } = useTheme();
  const html = useMemo(() => richStudyHtml(content, true), [content]);
  return <div className="meras-scientific" style={{ color: colors.text, minWidth: 0, maxWidth: "100%" }} dir="auto"><style>{richStudyCss.replace(/(^|})([^{}]+)\{/g, (_match, close, selectors) => close + selectors.split(",").map((selector: string) => selector.trim() === "body" ? ".meras-scientific" : ".meras-scientific " + selector.trim()).join(",") + "{")}</style><div dangerouslySetInnerHTML={{ __html: html }} /></div>;
});
