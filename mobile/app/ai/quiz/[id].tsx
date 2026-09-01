import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, EmptyState, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

type QuizQuestion = { id: string; type: "single_choice"; question: string; choices: [string, string, string, string] };
type Quiz = { id: number; conversationId: number | null; fileId: number; title: string; language: string; questions: QuizQuestion[]; createdAt: string; attempts: { id: number; score: number; total: number; percent: number; createdAt: string }[] };
type QuizResponse = { ok: true; quiz: Quiz };
type AttemptResult = { questionId: string; selectedIndex: number | null; correctIndex: number; isCorrect: boolean; explanation: string; translatedExplanation: string | null; scientificTerms: { term: string; translation: string }[] };
type AttemptResponse = { ok: true; attempt: { id: number; score: number; total: number; percent: number; createdAt: string }; results: AttemptResult[]; deepLink: string };

const optionLetters = ["أ", "ب", "ج", "د"];

export default function AiQuizScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Number(Array.isArray(params.id) ? params.id[0] : params.id);
  const { user } = useAuth();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [attempt, setAttempt] = useState<AttemptResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({ queryKey: ["ai-quiz", id, user?.id], queryFn: () => api<QuizResponse>(`/api/ai/quizzes/${id}`), enabled: Boolean(user && Number.isInteger(id) && id > 0) });
  const resultMap = useMemo(() => new Map(attempt?.results.map((item) => [item.questionId, item]) || []), [attempt]);

  if (!user) return <Screen><AppHeader title="اختبار مراس AI" back /><EmptyState title="سجّل الدخول أولًا" text="الاختبار مرتبط بصاحب الملف ولا يمكن فتحه من حساب آخر." /></Screen>;
  if (!Number.isInteger(id) || id <= 0) return <Screen><AppHeader title="اختبار مراس AI" back /><EmptyState title="رابط الاختبار غير صالح" text="افتح الاختبار من سجل مراس AI." /></Screen>;
  if (query.isLoading) return <Screen><AppHeader title="اختبار مراس AI" back /><LoadingState label="نجهّز بطاقات الاختبار…" /></Screen>;
  if (query.isError || !query.data) return <Screen><AppHeader title="اختبار مراس AI" back /><EmptyState icon="cloud-offline-outline" title="تعذر فتح الاختبار" text={query.error instanceof Error ? query.error.message : "حاول مرة أخرى."} action={<AppButton title="إعادة المحاولة" onPress={() => void query.refetch()} />} /></Screen>;

  const quiz = query.data.quiz;
  const question = quiz.questions[index];
  const answered = Object.keys(answers).length;
  const submit = async () => {
    if (answered !== quiz.questions.length || submitting) return;
    setSubmitting(true); setError("");
    try {
      const response = await api<AttemptResponse>(`/api/ai/quizzes/${id}/attempts`, { method: "POST", body: jsonBody({ answers: quiz.questions.map((item) => ({ questionId: item.id, choiceIndex: answers[item.id] })) }), timeoutMs: 2 * 60_000 });
      setAttempt(response);
      await Promise.all([query.refetch(), queryClient.invalidateQueries({ queryKey: ["ai-status"] })]);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر تصحيح الاختبار"); }
    finally { setSubmitting(false); }
  };

  const restart = () => { setAttempt(null); setAnswers({}); setIndex(0); setError(""); };

  if (attempt) return <Screen>
    <AppHeader title="نتيجة الاختبار" subtitle={quiz.title} back />
    <LinearGradient colors={attempt.attempt.percent >= 70 ? ["#065F46", "#0E9F76", "#14B8A6"] : ["#7C2D12", "#D97706", "#F59E0B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.resultHero}>
      <View style={styles.resultBadge}><Ionicons name={attempt.attempt.percent >= 70 ? "trophy" : "refresh"} size={29} color="#FFF" /></View>
      <Text style={styles.resultKicker}>{attempt.attempt.percent >= 70 ? "أداء رائع" : "محاولة جيدة"}</Text>
      <Text style={styles.resultPercent}>{attempt.attempt.percent}%</Text>
      <Text style={styles.resultText}>{attempt.attempt.score} إجابات صحيحة من {attempt.attempt.total}</Text>
    </LinearGradient>
    <View style={styles.resultActions}><AppButton title="إعادة الاختبار" icon="refresh-outline" variant="soft" onPress={restart} /><AppButton title="العودة إلى مراس AI" icon="sparkles-outline" onPress={() => router.replace("/(tabs)/ai")} /></View>
    <SectionTitle title="مراجعة الإجابات" subtitle="اقرأ الشرح والمصطلحات بعد كل سؤال" />
    <View style={styles.reviewList}>{quiz.questions.map((item, questionIndex) => {
      const result = resultMap.get(item.id);
      if (!result) return null;
      return <Card key={item.id} style={[styles.reviewCard, { borderColor: result.isCorrect ? `${colors.success}66` : `${colors.danger}55` }]}>
        <View style={styles.reviewHead}><View style={[styles.reviewState, { backgroundColor: result.isCorrect ? `${colors.success}16` : `${colors.danger}14` }]}><Ionicons name={result.isCorrect ? "checkmark-circle" : "close-circle"} size={20} color={result.isCorrect ? colors.success : colors.danger} /><Text style={{ color: result.isCorrect ? colors.success : colors.danger }}>{result.isCorrect ? "صحيحة" : "تحتاج مراجعة"}</Text></View><Text style={[styles.reviewNumber, { color: colors.textSoft }]}>السؤال {questionIndex + 1}</Text></View>
        <Text style={[styles.reviewQuestion, { color: colors.text }]}>{item.question}</Text>
        <View style={[styles.answerBox, { backgroundColor: `${colors.success}10` }]}><Text style={[styles.answerLabel, { color: colors.success }]}>الإجابة الصحيحة</Text><Text style={[styles.answerText, { color: colors.text }]}>{optionLetters[result.correctIndex]}. {item.choices[result.correctIndex]}</Text></View>
        {!result.isCorrect && result.selectedIndex != null ? <Text style={[styles.selectedWrong, { color: colors.danger }]}>إجابتك: {optionLetters[result.selectedIndex]}. {item.choices[result.selectedIndex]}</Text> : null}
        <View style={[styles.explanation, { backgroundColor: colors.surfaceAlt }]}><View style={styles.explanationTitle}><Ionicons name="bulb-outline" size={18} color={colors.primary} /><Text style={{ color: colors.primary }}>لماذا؟</Text></View><Text style={[styles.explanationText, { color: colors.text }]}>{result.explanation}</Text>{result.translatedExplanation ? <><Text style={[styles.translationLabel, { color: colors.primary }]}>الشرح المترجم</Text><Text style={[styles.explanationText, { color: colors.text }]}>{result.translatedExplanation}</Text></> : null}</View>
        {!!result.scientificTerms.length && <View style={styles.terms}>{result.scientificTerms.map((term) => <View key={`${item.id}-${term.term}`} style={[styles.term, { borderColor: colors.border }]}><Text style={[styles.termMain, { color: colors.text }]}>{term.term}</Text><Ionicons name="swap-horizontal" size={13} color={colors.textSoft} /><Text style={[styles.termTranslation, { color: colors.primary }]}>{term.translation}</Text></View>)}</View>}
      </Card>;
    })}</View>
  </Screen>;

  if (!question) return <Screen><AppHeader title="اختبار مراس AI" back /><EmptyState title="الاختبار بلا أسئلة" text="أنشئ اختبارًا جديدًا من الملف." /></Screen>;

  return <Screen>
    <AppHeader title="اختبار مراس AI" subtitle={quiz.title} back />
    <View style={styles.progressHead}><Text style={[styles.progressLabel, { color: colors.text }]}>السؤال {index + 1} من {quiz.questions.length}</Text><Text style={[styles.progressCount, { color: colors.primary }]}>{answered}/{quiz.questions.length} مجاب</Text></View>
    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}><LinearGradient colors={[colors.primary, "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.progressFill, { width: `${((index + 1) / quiz.questions.length) * 100}%` }]} /></View>

    <Card style={styles.questionCard}>
      <View style={[styles.questionIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="help" size={22} color={colors.primary} /></View>
      <Text style={[styles.question, { color: colors.text }]}>{question.question}</Text>
      <View style={styles.options}>{question.choices.map((choice, choiceIndex) => {
        const selected = answers[question.id] === choiceIndex;
        return <Pressable key={`${question.id}-${choiceIndex}`} onPress={() => setAnswers((current) => ({ ...current, [question.id]: choiceIndex }))} style={({ pressed }) => [styles.option, { backgroundColor: selected ? `${colors.primary}12` : colors.surface, borderColor: selected ? colors.primary : colors.border, transform: [{ scale: pressed ? .99 : 1 }] }]}>
          <View style={[styles.optionLetter, { backgroundColor: selected ? colors.primary : colors.surfaceAlt }]}><Text style={{ color: selected ? "#FFF" : colors.text, fontWeight: "900" }}>{optionLetters[choiceIndex]}</Text></View><Text style={[styles.optionText, { color: colors.text }]}>{choice}</Text>{selected ? <Ionicons name="checkmark-circle" size={21} color={colors.primary} /> : null}
        </Pressable>;
      })}</View>
    </Card>

    <View style={styles.navigation}>
      <View style={styles.navigationItem}><AppButton title="السابق" icon="arrow-forward-outline" variant="ghost" disabled={index === 0} onPress={() => setIndex((value) => Math.max(0, value - 1))} /></View>
      <View style={styles.navigationItem}>{index < quiz.questions.length - 1 ? <AppButton title="التالي" icon="arrow-back-outline" disabled={answers[question.id] == null} onPress={() => setIndex((value) => Math.min(quiz.questions.length - 1, value + 1))} /> : <AppButton title="تصحيح الاختبار" icon="checkmark-done-outline" loading={submitting} disabled={answered !== quiz.questions.length} onPress={() => void submit()} />}</View>
    </View>
    {answered < quiz.questions.length && index === quiz.questions.length - 1 ? <Text style={[styles.missing, { color: colors.textSoft }]}>أجب عن جميع الأسئلة قبل التصحيح. يمكنك الرجوع للأسئلة السابقة.</Text> : null}
    {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  progressHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 3 }, progressLabel: { fontSize: 12, fontWeight: "900" }, progressCount: { fontSize: 9, fontWeight: "900" }, progressTrack: { height: 8, borderRadius: 99, overflow: "hidden", marginTop: 10, marginBottom: 13 }, progressFill: { height: "100%", borderRadius: 99 },
  questionCard: { padding: 18 }, questionIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", marginBottom: 14 }, question: { fontSize: 17, lineHeight: 29, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, options: { gap: 9, marginTop: 18 }, option: { minHeight: 65, flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderWidth: 1.5, borderRadius: 17 }, optionLetter: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" }, optionText: { flex: 1, fontSize: 11, lineHeight: 19, textAlign: "right", writingDirection: "rtl" }, navigation: { flexDirection: "row", gap: 9, marginTop: 13 }, navigationItem: { flex: 1 }, missing: { fontSize: 9, lineHeight: 16, textAlign: "center", marginTop: 9 }, error: { fontSize: 9, textAlign: "center", marginTop: 9 },
  resultHero: { borderRadius: 28, alignItems: "center", padding: 25, overflow: "hidden" }, resultBadge: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.14)", borderWidth: 1, borderColor: "rgba(255,255,255,.2)" }, resultKicker: { color: "#E6FFF7", fontSize: 11, fontWeight: "900", marginTop: 12 }, resultPercent: { color: "#FFF", fontSize: 48, fontWeight: "900", marginTop: 2 }, resultText: { color: "#E2F6F1", fontSize: 10, marginTop: 3 }, resultActions: { gap: 8, marginTop: 12 }, reviewList: { gap: 10 }, reviewCard: { padding: 15 }, reviewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, reviewState: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 }, reviewNumber: { fontSize: 9, fontWeight: "800" }, reviewQuestion: { fontSize: 14, lineHeight: 24, fontWeight: "900", textAlign: "right", writingDirection: "rtl", marginTop: 13 }, answerBox: { borderRadius: 14, padding: 11, marginTop: 11 }, answerLabel: { fontSize: 8, fontWeight: "900" }, answerText: { fontSize: 11, lineHeight: 19, fontWeight: "800", textAlign: "right", marginTop: 3 }, selectedWrong: { fontSize: 9, lineHeight: 17, textAlign: "right", marginTop: 7 }, explanation: { borderRadius: 15, padding: 12, marginTop: 11 }, explanationTitle: { flexDirection: "row", alignItems: "center", gap: 6 }, explanationText: { fontSize: 10, lineHeight: 20, textAlign: "right", writingDirection: "rtl", marginTop: 7 }, translationLabel: { fontSize: 8, fontWeight: "900", textAlign: "right", marginTop: 10 }, terms: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }, term: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderRadius: 10 }, termMain: { fontSize: 8, fontWeight: "800" }, termTranslation: { fontSize: 8, fontWeight: "800" },
});
