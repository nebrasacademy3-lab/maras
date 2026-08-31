import test from "node:test";
import assert from "node:assert/strict";
import { answerAssistant, detectAssistantIntent, type LiveAssistantCatalog } from "../lib/assistant-knowledge";
import { buildAssistantSearchDocuments } from "../lib/assistant-context";
import { PUBLIC_SETTING_DEFAULTS } from "../lib/platform-settings";
import { retrieveAssistantDocuments } from "../lib/assistant-search";

const catalog: LiveAssistantCatalog = {
  institutions: [{
    slug: "orbit-university",
    name: "جامعة المدار",
    nameEn: "Orbit University",
    aliases: ["OU", "جامعة أوربت"],
    region: "الرياض",
    type: "أهلية",
    specialties: 1,
    courses: 1,
  }],
  programs: [{
    slug: "quantum-sciences",
    name: "علوم الكم الجديدة",
    aliases: ["Quantum Sciences"],
    institutionSlugs: ["orbit-university"],
  }],
  courses: [{
    slug: "advanced-quantum-mechanics",
    title: "ميكانيكا الكم المتقدمة",
    titleEn: "Advanced Quantum Mechanics",
    code: "QTM 901",
    university: "جامعة المدار",
    universitySlug: "orbit-university",
    specialty: "علوم الكم الجديدة",
    description: "مادة حية أضيفت من الإدارة للاختبار.",
    price: 137,
    rating: 0,
    ratingsCount: 0,
    students: 0,
    duration: "47 دقيقة",
    lessons: 1,
    updatedAt: "الآن",
    instructor: "فريق مراس",
    color: "from-blue-700 to-violet-600",
    icon: "Q",
    access: "90 يومًا",
    availableForPurchase: true,
    readyLessons: 1,
    units: [{
      title: "الوحدة التجريبية الجديدة",
      lessons: [{ id: "photon-entanglement", title: "تشابك فوتوني تطبيقي", duration: "47 دقيقة", free: true, ready: true, type: "video" }],
    }],
  }],
};

test("a newly added live course is matched in Arabic and English without a static knowledge entry", () => {
  const arabic = answerAssistant("وين مادة ميكانيكا الكمم المتقدمة؟", null, { ...PUBLIC_SETTING_DEFAULTS }, catalog);
  assert.match(arabic.answer, /ميكانيكا الكم المتقدمة/);
  assert.equal(arabic.actions[0]?.href, "/courses/advanced-quantum-mechanics");

  const english = answerAssistant("is advanced quantom mechanics available?", null, { ...PUBLIC_SETTING_DEFAULTS }, catalog);
  assert.match(english.answer, /Advanced Quantum Mechanics/);
  assert.match(english.answer, /SAR 137/);
});

test("live programs and lessons are indexed automatically and retrieved in a bounded result set", () => {
  const documents = buildAssistantSearchDocuments(catalog);
  assert.ok(documents.some((item) => item.id === "program:quantum-sciences:orbit-university"));
  assert.ok(documents.some((item) => item.id === "lesson:advanced-quantum-mechanics:photon-entanglement"));

  const noise = Array.from({ length: 80 }, (_, index) => ({ ...documents[0]!, id: `noise:${index}`, title: `سجل بعيد ${index}`, aliases: [] }));
  const hits = retrieveAssistantDocuments("هل درس تشابك فوتوني تطبيقي مجاني؟", [...noise, ...documents], 5);
  assert.ok(hits.length <= 5);
  assert.equal(hits[0]?.document.id, "lesson:advanced-quantum-mechanics:photon-entanglement");

  const reply = answerAssistant("ابغى درس تشابك فوتوني تطبيقي", null, { ...PUBLIC_SETTING_DEFAULTS }, catalog);
  assert.match(reply.answer, /درس «تشابك فوتوني تطبيقي»/);
  assert.match(reply.answer, /تجريبي مجاني/);
});

test("English variations classify correctly and unknown catalog facts are not invented", () => {
  assert.equal(detectAssistantIntent("I can't sign in to my account"), "login");
  assert.equal(detectAssistantIntent("Could you help me request a missing subject?"), "course_request");
  assert.equal(detectAssistantIntent("What does the refund policy say?"), "policy");

  const noCourses: LiveAssistantCatalog = { ...catalog, courses: [] };
  const reply = answerAssistant("ما مواد علوم الكم الجديدة؟", null, { ...PUBLIC_SETTING_DEFAULTS }, noCourses);
  assert.match(reply.answer, /لا توجد مادة منشورة/);
  assert.match(reply.answer, /لن أفترض/);
});

