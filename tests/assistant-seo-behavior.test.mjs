import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function isolated(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const key = "__assistantBehavior" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const input = "const {" + Object.keys(dependencies).join(",") + "} = globalThis[" + JSON.stringify(key) + "];\n" + source.replace(/^import .+;\r?\n/gm, "");
    return await import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(input, { fileName: path, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64"));
  } finally { delete globalThis[key]; }
}
const search = await isolated("../lib/assistant-search.ts");
const actions = await isolated("../lib/assistant-ai.ts", { whatsappHref: settings => settings.whatsapp || null });
const body = await isolated("../lib/request-body.ts");
const seo = await isolated("../lib/seo.ts", { process: { env: {} } });

const course = { slug: "physics", title: "الفيزياء الحديثة", titleEn: "Modern Physics", code: "PHY201", universitySlug: "orbit", university: "جامعة المدار", specialty: "العلوم", description: "شرح الحركة والطاقة", instructor: "فريق مراس", price: 120, access: "90 يومًا", duration: "ساعتان", lessons: 1, availableForPurchase: true, units: [{ title: "الحركة", lessons: [{ id: "velocity", title: "السرعة المتجهة", free: true, ready: true }] }] };

test("Arabic and English followups use the last explicit user topic without trusting generated replies", () => {
  const history = [{ role: "user", text: "أريد مادة الفيزياء الحديثة" }, { role: "assistant", text: "مادة خاطئة اخترعتها الإجابة السابقة" }];
  for (const question of ["كم سعرها؟", "طيب هل فيها درس مجاني؟", "وكيف اشتريها؟", "How much does it cost?", "Does it have a free lesson?", "What lessons are included?", "How do I buy it?", "ما الدروس الموجودة؟"]) {
    const result = search.resolveAssistantQuestion(question, history);
    assert.match(result, /الفيزياء الحديثة/);
    assert.ok(result.endsWith(question));
    assert.doesNotMatch(result, /خاطئة/);
  }
  const multiple = [...history, { role: "user", text: "كم سعرها؟" }, { role: "assistant", text: "120 ريال" }];
  assert.match(search.resolveAssistantQuestion("وكم مدتها؟", multiple), /الفيزياء الحديثة/);
  for (const question of ["أريد مادة الكيمياء العضوية", "كيف أستعيد كلمة المرور؟", "How much is organic chemistry?"]) assert.equal(search.resolveAssistantQuestion(question, history), question);
  assert.equal(search.resolveAssistantQuestion("كم سعرها؟", [{ role: "assistant", text: "الفيزياء الحديثة" }]), "كم سعرها؟");
});

test("assistant links authorize normalized paths and reject encoded role bypasses", () => {
  for (const href of ["/admin", "/supervisor", "/courses/../admin", "/courses/%2e%2e/admin", "/courses/../%61dmin", "/courses/%252e%252e/admin", "/courses/%2fadmin", "/courses/%00admin", "//evil.test", "/\\evil.test", "javascript:alert(1)"]) {
    assert.deepEqual(actions.sanitizeAssistantActions([{ label: "open", href }], null, {}), [], href);
  }
  assert.equal(actions.sanitizeAssistantActions([{ label: "الإدارة", href: "/admin/finance" }], { role: "admin" }, {}).length, 1);
  assert.equal(actions.sanitizeAssistantActions([{ label: "المواد", href: "/dashboard?view=courses" }], null, {}).length, 1);
  assert.equal(actions.sanitizeAssistantActions([{ label: "مادة", href: "/courses/%D9%81%D9%8A%D8%B2%D9%8A%D8%A7%D8%A1" }], null, {}).length, 1);
});

test("assistant external links point only to published accounts, never another account on an allowed social host", () => {
  const settings = { social_telegram: "https://t.me/meras", whatsapp: "https://wa.me/966500000000" };
  const sanitize = href => actions.sanitizeAssistantActions([{ label: "تواصل", href }], null, settings);
  assert.equal(sanitize(settings.social_telegram).length, 1);
  assert.equal(sanitize(settings.whatsapp).length, 1);
  for (const href of ["https://t.me/attacker", "https://wa.me/966599999999", "https://attacker@t.me/meras", "https://t.me/meras?redirect=evil", "https://evil.test"]) assert.equal(sanitize(href).length, 0);
});

test("live assistant catalog hides unpublished institutions and their courses", async () => {
  const context = await isolated("../lib/assistant-context.ts", { ...search, process: { env: {} }, allPrograms: [], getInstitutionPrograms: () => [], getInstitutionsCatalog: async () => [{ slug: "orbit", name: "جامعة المدار", nameEn: "Orbit University", region: "الرياض", type: "أهلية", courses: 1, specialties: 1 }], getCoursesCatalog: async () => [course, { ...course, slug: "secret", universitySlug: "hidden" }] });
  const live = await context.getAssistantLiveCatalog();
  assert.deepEqual(live.courses.map(item => item.slug), ["physics"]);
  const documents = context.buildAssistantSearchDocuments({ ...live, courses: [...live.courses, { ...course, slug: "secret", universitySlug: "hidden" }] });
  assert.ok(documents.some(item => item.id === "lesson:physics:velocity"));
  assert.ok(documents.every(item => !item.id.includes("secret")));
  const hits = search.retrieveAssistantDocuments("هل درس السرعة المتجهة مجاني؟", documents, 3);
  assert.equal(hits[0].document.id, "lesson:physics:velocity");
});

test("assistant rejects invalid JSON objects and oversized requests before data or provider access", async () => {
  const route = await isolated("../app/api/assistant/route.ts", { ...body, sameOriginRequest: () => true, checkRateLimit: async () => true, clientIp: () => "127.0.0.1", cleanText: (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "", jsonError: (message, status = 400) => Response.json({ error: message }, { status }) });
  for (const [payload, expected] of [["null", 400], ["[]", 400], ['"question"', 400], ["{", 400], [JSON.stringify({ question: "x".repeat(40_000) }), 413]]) {
    const response = await route.POST(new Request("https://test/assistant", { method: "POST", body: payload }));
    assert.equal(response.status, expected);
  }
});

test("search descriptions decode pasted rich text and remove direction controls without joining Arabic words", () => {
  assert.equal(seo.seoDescription("شرح&nbsp;**الفيزياء** &#x202E; [الحديثة](https://test) &lt;b&gt;لطلاب&lt;/b&gt; &#1575;لجامعة"), "شرح الفيزياء الحديثة لطلاب الجامعة");
  assert.equal(seo.seoDescription("الأول<div>الثاني</div><script>alert(1)</script> الثالث"), "الأول الثاني الثالث");
  assert.doesNotThrow(() => seo.seoDescription("&#999999999; &#xD800;"));
  const long = seo.seoDescription("شرح الحركة والطاقة والسرعة بطريقة واضحة. ".repeat(20));
  assert.ok(Array.from(long).length <= 180);
  assert.ok(long.endsWith("…"));
  assert.match(seo.courseSeoDescription(course), /^شرح الفيزياء الحديثة لطلاب جامعة المدار/);
  assert.match(seo.courseSeoDescription(course), /درسًا مجانيًا/);
  assert.doesNotMatch(seo.courseSeoDescription({ ...course, units: [] }), /درسًا مجانيًا/);
});
test("progress and analytics reject malformed and oversized bodies without reaching persistence", async () => {
  for (const path of ["../app/api/progress/route.ts", "../app/api/analytics/route.ts"]) {
    const route = await isolated(path, { ...body, sameOriginRequest: () => true, checkRateLimit: async () => true, clientIp: () => "127.0.0.1", getSessionUser: async () => ({ id: 1, email: "student@example.test" }), jsonError: (message, status = 400) => Response.json({ error: message }, { status }) });
    for (const [payload, expected] of [["null", 400], ["[]", 400], [JSON.stringify({ value: "x".repeat(20_000) }), 413]]) {
      const response = await route.POST(new Request("https://test/api", { method: "POST", body: payload }));
      assert.equal(response.status, expected, path);
    }
  }
});

test("rotating anonymous analytics IDs cannot bypass the IP rate limit", async () => {
  const checked = [];
  const route = await isolated("../app/api/analytics/route.ts", { sameOriginRequest: () => true, checkRateLimit: async (...args) => { checked.push(args); return false; }, clientIp: () => "198.51.100.1", jsonError: (message, status) => Response.json({ error: message }, { status }) });
  const response = await route.POST(new Request("https://test/api", { method: "POST", body: JSON.stringify({ event: "page_view", anonymousId: "rotated" }) }));
  assert.equal(response.status, 429);
  assert.equal(checked[0][0], "analytics-ip");
  assert.equal(checked[0][1], "198.51.100.1");
});

test("live public settings include Telegram while explicitly private settings stay out of assistant context", async () => {
  const context = await isolated("../lib/assistant-context.ts", { ...search, process: { env: {} }, SETTING_META: { max_student_devices: { isPublic: false } }, whatsappHref: () => null });
  const result = await context.buildAssistantContext(null, { social_telegram: "https://t.me/meras", support_hours: "9-5", max_student_devices: "private-secret-test" }, "Telegram", { institutions: [], courses: [], programs: [] });
  assert.match(result, /Telegram=https:\/\/t.me\/meras/);
  assert.doesNotMatch(result, /private-secret-test/);
});
test("fallback answers live followups with actual preview and curriculum details in the newest question language", async () => {
  const knowledge = await isolated("../lib/assistant-knowledge.ts", { ...search, allPrograms: [], getInstitutionPrograms: () => [], PUBLIC_SETTING_DEFAULTS: {}, whatsappHref: () => null });
  const catalog = { courses: [course], institutions: [{ slug: "orbit", name: "جامعة المدار", nameEn: "Orbit University" }], programs: [] };
  const history = [{ role: "user", text: "أريد مادة الفيزياء الحديثة" }];
  const preview = knowledge.answerAssistant(search.resolveAssistantQuestion("هل فيها درس مجاني؟", history), null, {}, catalog, "ar");
  assert.match(preview.answer, /السرعة المتجهة/);
  assert.equal(preview.actions[0].href, "/courses/physics#preview");
  const price = knowledge.answerAssistant(search.resolveAssistantQuestion("How much does it cost?", history), null, {}, catalog, "en");
  assert.match(price.answer, /Current price: SAR 120/);
  assert.match(price.answer, /Access period/);
  const curriculum = knowledge.answerAssistant("ما الدروس الموجودة في الفيزياء الحديثة؟", null, {}, catalog);
  assert.match(curriculum.answer, /الحركة: السرعة المتجهة/);
  const unready = knowledge.answerAssistant("هل فيزياء حديثة فيها درس مجاني؟", null, {}, { ...catalog, courses: [{ ...course, units: [{ title: "الحركة", lessons: [{ title: "السرعة المتجهة", id: "velocity", free: true, ready: false }] }] }] });
  assert.match(unready.answer, /لا يظهر.*درس تجريبي مجاني جاهز/);
});
test("assistant returns canonical internal routes that web and mobile interpret identically", () => {
  for (const [href, expected] of [
    ["/courses/../dashboard?view=account#security", "/dashboard?view=account#security"],
    ["/%64ashboard?view=account", "/dashboard?view=account"],
    ["/dashboard/?view=courses", "/dashboard?view=courses"],
    ["/courses/%70hysics#preview", "/courses/physics#preview"],
  ]) {
    assert.equal(actions.sanitizeAssistantActions([{ label: "فتح", href }], null, {})[0]?.href, expected);
  }
  const duplicates = actions.sanitizeAssistantActions([{ label: "لوحتي", href: "/%64ashboard" }, { label: "لوحتي", href: "/dashboard" }], null, {});
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].href, "/dashboard");
});