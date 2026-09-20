import type { StoredQuizQuestion } from "@/lib/ai-generation";

/** Validate, then grade server-held questions. Malformed/duplicate input is not
 * silently truncated, coerced, or allowed to overwrite an earlier answer. */
export function gradeStudyQuiz(questions: StoredQuizQuestion[], supplied: unknown) {
  if (!questions.length || questions.length > 100 || new Set(questions.map(q => q.id)).size !== questions.length
    || questions.some(q => typeof q.id !== "string" || !q.id || !Array.isArray(q.choices) || q.choices.length !== 4 || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.choices.length)) {
    throw new Error("Invalid stored quiz");
  }
  if (!Array.isArray(supplied) || supplied.length > questions.length) throw new TypeError("Invalid answers");
  const byId = new Map(questions.map(q => [q.id, q]));
  const answers = new Map<string, number>();
  for (const value of supplied) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid answer");
    const { questionId, choiceIndex } = value as Record<string, unknown>;
    if (typeof questionId !== "string" || !byId.has(questionId) || answers.has(questionId)
      || typeof choiceIndex !== "number" || !Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= byId.get(questionId)!.choices.length) throw new TypeError("Invalid answer");
    answers.set(questionId, choiceIndex);
  }
  const results = questions.map(question => {
    const selectedIndex = answers.get(question.id) ?? null;
    return { questionId: question.id, selectedIndex, correctIndex: question.correctIndex, isCorrect: selectedIndex === question.correctIndex, explanation: question.explanation, translatedExplanation: question.translatedExplanation, scientificTerms: question.scientificTerms };
  });
  return { results, score: results.filter(result => result.isCorrect).length, total: questions.length,
    answers: [...answers].map(([questionId, choiceIndex]) => ({ questionId, choiceIndex })) };
}
