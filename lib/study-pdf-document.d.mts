export type StudyPdfInput = { title: string; recipient?: string; content: string; sourceName: string; createdAt: string; branding: { siteUrl: string; whatsapp: string; description: string; links: Array<{ label: string; url: string }> } };
export class StudyPdfError extends Error { code: string; constructor(code: string, message?: string); }
export const STUDY_PDF_VERSION: string;
export const MAX_PDF_INPUT_CHARS: number;
export const MAX_PDF_BYTES: number;
export function escapePdfHtml(value: unknown): string;
export function validatePdfInput(input: unknown): StudyPdfInput;
export function pdfInputDigest(input: StudyPdfInput): string;
export function studyMarkdownHtml(markdown: string): string;
export function buildStudyPdfDocument(input: StudyPdfInput, assets: { logo: string; mathCss: string }): { html: string; header: string; footer: string };
