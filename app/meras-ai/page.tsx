import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { MerasAiWorkspace } from "@/components/meras-ai-workspace";
import { requireUser } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "مراس AI | مساعدك الدراسي",
  description: "لخّص ملفاتك وترجم الشرائح وأنشئ اختبارات تفاعلية مع مراس AI.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MerasAiPage({ searchParams }: { searchParams: Promise<{ conversation?: string; quiz?: string; service?: string }> }) {
  const user = await requireUser("/meras-ai");
  const query = await searchParams;
  const conversationId = Math.max(0, Math.floor(Number(query.conversation)) || 0);
  const quizId = Math.max(0, Math.floor(Number(query.quiz)) || 0);
  const service = query.service === "summary" || query.service === "translation" || query.service === "quiz" ? query.service : null;
  return <main><SiteHeader appMode userName={user.fullName}/><MerasAiWorkspace studentName={user.fullName} initialConversationId={conversationId || null} initialQuizId={quizId || null} initialService={service}/></main>;
}
