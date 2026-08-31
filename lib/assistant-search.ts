export type AssistantLanguage = "ar" | "en";

export type AssistantSearchDocument = {
  id: string;
  type: "institution" | "program" | "course" | "unit" | "lesson" | "policy" | "setting";
  title: string;
  aliases?: string[];
  keywords?: string[];
  content: string;
  href?: string;
};

export type AssistantSearchHit = { document: AssistantSearchDocument; score: number };

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

const TOKEN_CANONICAL: Record<string, string> = {
  جامعات: "جامعه", الجامعات: "جامعه", جامعه: "جامعه", الجامعه: "جامعه",
  كليات: "كليه", الكليات: "كليه", كليه: "كليه", الكليه: "كليه",
  تخصصات: "تخصص", التخصصات: "تخصص", تخصصي: "تخصص",
  مواد: "ماده", المواد: "ماده", مادتي: "ماده", الماده: "ماده",
  مقررات: "مقرر", المقررات: "مقرر", مقرري: "مقرر",
  دروس: "درس", الدروس: "درس", درسي: "درس",
  universities: "university", colleges: "college", programmes: "program", programs: "program",
  majors: "major", specializations: "specialization", specialisations: "specialization",
  courses: "course", subjects: "subject", modules: "module", lessons: "lesson", lectures: "lecture",
  videos: "video", settings: "setting", policies: "policy",
};

const CONCEPTS: string[][] = [
  ["جامعه", "university", "uni"],
  ["كليه", "college"],
  ["تخصص", "major", "program", "programme", "specialization", "specialisation"],
  ["ماده", "مقرر", "course", "subject", "module", "class"],
  ["درس", "محاضره", "فيديو", "lesson", "lecture", "video"],
  ["تسجيل الدخول", "دخول", "login", "log in", "sign in", "signin"],
  ["انشاء حساب", "تسجيل", "signup", "sign up", "register", "registration"],
  ["الدفع", "شراء", "payment", "purchase", "checkout", "pay"],
  ["الدعم", "مساعده", "support", "help"],
  ["علوم الحاسب", "علوم الكمبيوتر", "computer science", "computing", "cs"],
  ["تقنيه المعلومات", "تكنولوجيا المعلومات", "information technology", "it"],
  ["هندسه البرمجيات", "software engineering"],
  ["الامن السيبراني", "امن سيبراني", "cybersecurity", "cyber security"],
  ["الذكاء الاصطناعي", "artificial intelligence", "ai"],
  ["علم البيانات", "data science"],
  ["اداره الاعمال", "business administration", "business management"],
  ["المحاسبه", "accounting"],
  ["الطب", "medicine", "medical"],
  ["التمريض", "nursing"],
  ["الصيدله", "pharmacy", "pharmacology"],
  ["الرياضيات", "math", "maths", "mathematics"],
  ["التفاضل والتكامل", "calculus"],
];

const STOP_WORDS = new Set([
  "في", "من", "عن", "على", "الي", "الى", "هل", "وش", "ايش", "كيف", "وين", "ابي", "ابغى", "اريد", "ممكن", "لو", "فضلا", "عندي", "هو", "هي", "هذا", "هذه", "ذا", "اللي", "حق", "عشان", "مع",
  "a", "an", "the", "in", "on", "at", "to", "for", "from", "of", "and", "or", "is", "are", "do", "does", "can", "could", "would", "please", "want", "need", "my", "me", "i", "you", "your", "about", "show", "tell", "find",
]);

export function normalizeAssistantText(value: string) {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[پ]/g, "ب").replace(/[چ]/g, "ج").replace(/[گ]/g, "ك").replace(/[ڤ]/g, "ف")
    .replace(/[ًٌٍَُِّْـ]/g, "").replace(/(.)\1{2,}/gu, "$1")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function canonicalToken(token: string) {
  return TOKEN_CANONICAL[token] || token;
}

function conceptTokens(normalized: string) {
  const output: string[] = [];
  CONCEPTS.forEach((aliases, index) => {
    if (aliases.some((alias) => {
      const value = normalizeAssistantText(alias);
      return normalized === value || normalized.includes(` ${value} `) || normalized.startsWith(`${value} `) || normalized.endsWith(` ${value}`);
    })) output.push(`concept${index}`);
  });
  return output;
}

export function assistantSearchTokens(value: string) {
  const normalized = normalizeAssistantText(value);
  const base = normalized.split(" ").map(canonicalToken).filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  return [...new Set([...base, ...conceptTokens(` ${normalized} `.trim())])];
}

export function detectAssistantLanguage(value: string): AssistantLanguage {
  const arabic = (value.match(/[\u0600-\u06ff]/g) || []).length;
  const latin = (value.match(/[a-z]/gi) || []).length;
  return latin > Math.max(3, arabic * 1.35) ? "en" : "ar";
}

function bigrams(value: string) {
  return Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2));
}

function dice(left: string, right: string) {
  if (left === right) return 1;
  if (Math.min(left.length, right.length) < 3) return 0;
  const a = bigrams(left);
  const remaining = bigrams(right);
  let overlap = 0;
  for (const item of a) {
    const index = remaining.indexOf(item);
    if (index >= 0) { overlap += 1; remaining.splice(index, 1); }
  }
  return (2 * overlap) / Math.max(1, a.length + bigrams(right).length);
}

function tokenSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (left.startsWith("concept") || right.startsWith("concept")) return 0;
  if (Math.min(left.length, right.length) >= 3 && (left.includes(right) || right.includes(left))) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length) >= 0.68 ? 0.9 : 0.72;
  }
  return dice(left, right);
}

export function assistantMatchScore(query: string, candidate: string) {
  const normalizedQuery = normalizeAssistantText(query);
  const normalizedCandidate = normalizeAssistantText(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedQuery === normalizedCandidate) return 1;
  if (normalizedCandidate.length >= 3 && (` ${normalizedQuery} `).includes(` ${normalizedCandidate} `)) return 0.99;
  const compactQuery = normalizedQuery.replace(/\s/g, "");
  const compactCandidate = normalizedCandidate.replace(/\s/g, "");
  if (compactCandidate.length >= 3 && compactQuery.includes(compactCandidate)) return 0.98;

  const queryTokens = assistantSearchTokens(normalizedQuery);
  const candidateTokens = assistantSearchTokens(normalizedCandidate);
  if (!queryTokens.length || !candidateTokens.length) return 0;
  const similarities = candidateTokens.map((wanted) => Math.max(...queryTokens.map((actual) => tokenSimilarity(actual, wanted))));
  const coverage = similarities.reduce((sum, score) => sum + score, 0) / similarities.length;
  const strongCoverage = similarities.filter((score) => score >= 0.72).length / similarities.length;
  const exactCoverage = similarities.filter((score) => score === 1).length / similarities.length;
  if (strongCoverage < 0.5) return 0;
  return Math.min(0.97, coverage * 0.62 + strongCoverage * 0.25 + exactCoverage * 0.13);
}

export function findBestAssistantMatch<T>(query: string, rows: T[], fields: (row: T) => Array<string | undefined>, minimum = 0.72) {
  let best: { row: T; score: number } | null = null;
  for (const row of rows) {
    const score = Math.max(0, ...fields(row).filter((value): value is string => Boolean(value?.trim())).map((value) => assistantMatchScore(query, value)));
    if (score >= minimum && (!best || score > best.score)) best = { row, score };
  }
  return best;
}

function documentScore(question: string, document: AssistantSearchDocument) {
  const title = assistantMatchScore(question, document.title);
  const alias = Math.max(0, ...(document.aliases || []).map((value) => assistantMatchScore(question, value)));
  const keywords = Math.max(0, ...(document.keywords || []).map((value) => assistantMatchScore(question, value)));
  const content = assistantMatchScore(question, document.content);
  return Math.max(title, alias * 0.98, keywords * 0.83, content * 0.64);
}

export function retrieveAssistantDocuments(question: string, documents: AssistantSearchDocument[], limit = 14): AssistantSearchHit[] {
  return documents.map((document) => ({ document, score: documentScore(question, document) }))
    .filter((hit) => hit.score >= 0.3)
    .sort((left, right) => right.score - left.score || left.document.title.localeCompare(right.document.title, "ar"))
    .slice(0, Math.max(1, Math.min(30, limit)));
}
