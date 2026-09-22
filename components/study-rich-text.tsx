"use client";
import { memo, useMemo } from "react";
import { richStudyHtml } from "@/lib/study-rich-text.mjs";
import "katex/dist/katex.min.css";
import "./study-rich-text.css";
export const StudyRichText = memo(function StudyRichText({ content }: { content: string }) {
  const html = useMemo(() => richStudyHtml(content), [content]);
  return <div className="study-rich-text" dir="auto" dangerouslySetInnerHTML={{ __html: html }} />;
});
