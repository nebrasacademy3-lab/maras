import assert from "node:assert/strict";
import test from "node:test";
import { pureSource } from "./helpers/pure-source.mjs";
const { gradeStudyQuiz } = await pureSource("lib/study-quiz-grading.ts");
const questions = [0, 1].map(i => ({ id: `q${i}`, choices: ["أ", "ب", "ج", "د"], correctIndex: i, explanation: `explain ${i}`, translatedExplanation: null, scientificTerms: [] }));
test("quiz grading accepts first choice zero and leaves unanswered questions explicitly null", () => {
  const g = gradeStudyQuiz(questions, [{ questionId: "q0", choiceIndex: 0 }]); assert.equal(g.score, 1); assert.equal(g.total, 2);
  assert.equal(g.results[0].selectedIndex, 0); assert.equal(g.results[1].selectedIndex, null); assert.equal(g.results[1].isCorrect, false);
});
test("quiz grading rejects duplicate, foreign, truncated and coerced answers", () => {
  for (const answers of [null, {}, [null], [[]], [{ questionId: "q0", choiceIndex: 0 }, { questionId: "q0", choiceIndex: 1 }], [{ questionId: "q-other", choiceIndex: 1 }], Array(3).fill({ questionId: "q0", choiceIndex: 0 })]) assert.throws(() => gradeStudyQuiz(questions, answers), TypeError);
  for (const choiceIndex of [null, false, "0", "1", 1.5, -1, 4, NaN, Infinity]) assert.throws(() => gradeStudyQuiz(questions, [{ questionId: "q0", choiceIndex }]), TypeError);
});
test("corrupt stored question sets cannot be graded or expose a made-up correct answer", () => {
  for (const q of [[], [questions[0], questions[0]], [{ ...questions[0], choices: [] }], [{ ...questions[0], correctIndex: 6 }]]) assert.throws(() => gradeStudyQuiz(q, []), /Invalid stored quiz/);
});
