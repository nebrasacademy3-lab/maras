export const AI_SERVICES = ["chat", "summary", "translation", "quiz"] as const;
export type AiService = typeof AI_SERVICES[number];

export type AiUsageStatus = {
  service: AiService;
  enabled: boolean;
  limit: number;
  used: number;
  remaining: number;
  model: string;
  maxFileBytes: number;
};

export type AiEntitlementStatus = {
  tier: "free" | "subscriber";
  active: boolean;
  source: "free" | "course" | "paid" | "admin" | "gift" | "referral";
  expiresAt: string | null;
  monthlyPrice: number;
  currency: "SAR";
};

export type AiConversationSummary = {
  id: number;
  title: string;
  kind: string;
  status: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
};

export type AiMessagePayload = {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  service: AiService;
  content: string;
  fileId: number | null;
  model: string | null;
  createdAt: string;
};

export type AiFilePayload = {
  id: number;
  conversationId: number | null;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  status: string;
  scanStatus: string;
  createdAt: string;
};

export type AiArtifactPayload = {
  id: number;
  conversationId: number | null;
  fileId: number;
  kind: "summary" | "translation";
  title: string;
  content: string;
  createdAt: string;
};

export type AiQuizQuestion = {
  id: string;
  type: "single_choice";
  question: string;
  choices: [string, string, string, string];
};

export type AiQuizPayload = {
  id: number;
  conversationId: number | null;
  fileId: number;
  title: string;
  language: string;
  questions: AiQuizQuestion[];
  createdAt: string;
  attempts: Array<{ id: number; score: number; total: number; percent: number; createdAt: string }>;
};

export type AiQuizAttemptResult = {
  questionId: string;
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean;
  explanation: string;
  translatedExplanation: string | null;
  scientificTerms: Array<{ term: string; translation: string }>;
};

export type AiDeepLinks = {
  home: "/meras-ai";
  conversation: string;
  quiz: string;
  subscribe: "/meras-ai/subscribe";
};

export const aiDeepLinks = (input: { conversationId?: number | null; quizId?: number | null } = {}): AiDeepLinks => ({
  home: "/meras-ai",
  conversation: input.conversationId ? `/meras-ai?conversation=${input.conversationId}` : "/meras-ai",
  quiz: input.quizId ? `/meras-ai?quiz=${input.quizId}` : "/meras-ai",
  subscribe: "/meras-ai/subscribe",
});

export function isAiService(value: unknown): value is AiService {
  return typeof value === "string" && (AI_SERVICES as readonly string[]).includes(value);
}
