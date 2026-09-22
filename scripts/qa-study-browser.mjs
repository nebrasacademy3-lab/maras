/** Real lesson/tool UI against isolated loopback data; never call a live AI provider. */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const fixture = JSON.parse(readFileSync(".data/qa-fixtures.json", "utf8"));
const origin = "http://127.0.0.1:3100";
if (fixture.origin !== origin) throw new Error("Synthetic loopback fixtures required");
const a = fixture.users.find(u => u.role === "student-a"), b = fixture.users.find(u => u.role === "student-b");
const request = (path, token) => fetch(origin + path, { headers: token ? { cookie: `meras_session=${token}` } : {} });
assert.equal((await request(`/api/ai/jobs/${fixture.study.jobId}`, b.token)).status, 404);
assert.equal((await request(`/api/ai/artifacts/${fixture.study.artifactId}/download`, b.token)).status, 404);
assert.equal((await request(`/api/ai/artifacts/${fixture.study.artifactId}/download`, a.token)).status, 200);
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const folder = ".data/study-browser";
mkdirSync(folder, { recursive: true });
const checks = [], errors = [];
let page, currentStage = "initializing", generationRequests = 0;
const stage = value => {
  currentStage = value;
  writeFileSync(`${folder}/progress.json`, JSON.stringify({ stage: value }));
  console.log("STUDY_BROWSER_STAGE", value);
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ar-SA", reducedMotion: "reduce" });
  context.setDefaultTimeout(30_000);
  await context.addCookies([{ name: "meras_session", value: a.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
  page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", item => {
    if (item.method() === "POST" && /\/api\/(?:ai\/files\/\d+\/actions|course-resources\/\d+\/tutor)/.test(item.url())) generationRequests++;
  });
  stage("five-tabs-and-default-overview");
  const navigation = await page.goto(`${origin}/learn/qa-physics`, { waitUntil: "domcontentloaded" });
  assert.equal(navigation.status(), 200);
  const tabs = page.getByRole("tablist", { name: "أدوات الدرس", exact: true });
  const names = ["نظرة عامة", "ملاحظاتي", "ملفات المادة", "اختبر نفسك", "المعلم الذكي"];
  await page.getByRole("tabpanel", { name: names[0], exact: true }).getByRole("heading", { name: "عن هذا الدرس", exact: true }).waitFor();
  // Progress readiness is set by the mounted learning room, not streaming SSR.
  await page.waitForFunction(() => document.querySelector(".lesson-toolbar button")?.disabled === false);
  assert.deepEqual((await tabs.getByRole("tab").allTextContents()).map(value => value.trim()), names);
  assert.equal(await tabs.getByRole("tab", { selected: true }).count(), 1);
  assert.equal(await tabs.getByRole("tab", { name: names[0], exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(await page.getByRole("link", { name: "العودة للوحة الطالب", exact: true }).getAttribute("href"), "/dashboard");
  assert.equal(await page.locator('input[type="file"]').count(), 0);
  const selectTab = async name => {
    await tabs.getByRole("tab", { name, exact: true }).click();
    await tabs.getByRole("tab", { name, exact: true, selected: true }).waitFor();
    const panel = page.getByRole("tabpanel", { name, exact: true });
    await panel.waitFor();
    assert.equal(await tabs.getByRole("tab", { selected: true }).count(), 1);
    return panel;
  };
  await page.screenshot({ path: `${folder}/learn-light.png`, fullPage: true, animations: "disabled" });
  await tabs.getByRole("tab", { name: names[0], exact: true }).press("ArrowLeft");
  await tabs.getByRole("tab", { name: names[1], exact: true, selected: true }).waitFor();
  assert.equal(await tabs.getByRole("tab", { name: names[1], exact: true }).evaluate(element => element === document.activeElement), true);
  const noteDraft = "ملاحظة اصطناعية: القوة تساوي الكتلة مضروبة بالتسارع.";
  await page.getByRole("tabpanel", { name: names[1], exact: true }).getByRole("textbox").fill(noteDraft);
  const files = await selectTab(names[2]);
  await files.getByRole("heading", { name: "ملف الدرس الاصطناعي", exact: true }).waitFor();
  await files.getByRole("button", { name: "تنزيل ملف الدرس الاصطناعي", exact: true }).waitFor();
  checks.push("exactly five ordered lesson tabs, default overview, RTL keyboard focus, notes and approved course files");

  stage("linked-quiz-and-tutor-state");
  let quizPanel = await selectTab(names[3]);
  await quizPanel.getByRole("heading", { name: "اختبار من الملف", exact: true }).waitFor();
  const selectedSource = await quizPanel.getByLabel("ملف الدرس").inputValue();
  assert.ok(Number(selectedSource) > 0, "lesson reference is selected automatically");
  assert.match(await quizPanel.getByLabel("ملف الدرس").locator("option:checked").innerText(), /ملف الدرس الاصطناعي/);
  assert.equal(await quizPanel.locator('input[type="file"]').count(), 0, "linked lesson quiz must not ask for another upload");
  await quizPanel.getByLabel("عدد الأسئلة").selectOption("5");
  await quizPanel.getByLabel("مستوى الصعوبة").selectOption("hard");
  await quizPanel.getByLabel("مستوى الصعوبة").selectOption("medium");
  const [threadResponse, tutor] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === `/api/course-resources/${selectedSource}/tutor` && response.request().method() === "GET"),
    selectTab(names[4]),
  ]);
  assert.equal(threadResponse.status(), 200);
  const tutorInput = tutor.getByRole("textbox", { name: "سؤالك عن الدرس", exact: true });
  const tutorDraft = "اشرح قانون نيوتن من ملف هذا الدرس.";
  await tutorInput.fill(tutorDraft);
  assert.equal(await tutor.getByRole("combobox").inputValue(), selectedSource);
  assert.equal(await tutor.locator('input[type="file"]').count(), 0);
  const notes = await selectTab(names[1]);
  assert.equal(await notes.getByRole("textbox").inputValue(), noteDraft);
  quizPanel = await selectTab(names[3]);
  assert.equal(await quizPanel.getByLabel("عدد الأسئلة").inputValue(), "5");
  assert.equal(await quizPanel.getByLabel("مستوى الصعوبة").inputValue(), "medium");
  assert.equal(generationRequests, 0, "opening tabs never generates a quiz or sends a tutor message");
  checks.push("quiz/tutor auto-select the approved reference; count, difficulty and drafts survive switching tabs without provider requests");

  stage("light-dark-lesson-theme");
  await quizPanel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${folder}/tools-light.png`, fullPage: true, animations: "disabled" });
  const light = await page.locator(".learning-page").evaluate(el => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
  await page.getByRole("button", { name: "تفعيل الوضع الليلي", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await page.screenshot({ path: `${folder}/learn-dark.png`, fullPage: true, animations: "disabled" });
  await quizPanel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${folder}/tools-dark.png`, fullPage: true, animations: "disabled" });
  const dark = await page.locator(".learning-page").evaluate(el => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
  assert.notDeepEqual(light, dark, "learning theme must actually change");
  await page.getByRole("button", { name: "تفعيل الوضع الفاتح", exact: true }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  checks.push("live light/dark lesson theme switch changes actual computed colors");

  stage("real-cached-quiz-and-grading");
  await quizPanel.getByRole("button", { name: "اختبار من الملف", exact: true }).click();
  const quiz = quizPanel.getByRole("region", { name: "اختبر نفسك", exact: true });
  await quiz.waitFor({ timeout: 90_000 });
  for (let i = 0; i < 5; i++) {
    assert.equal(await quiz.getByRole("radiogroup").count(), 1);
    await quiz.getByRole("radio").first().check();
    if (i < 4) await quiz.getByRole("button", { name: "التالي", exact: true }).click();
  }
  const [gradeResponse] = await Promise.all([
    page.waitForResponse(response => /\/api\/ai\/quizzes\/\d+\/attempts$/.test(new URL(response.url()).pathname) && response.request().method() === "POST"),
    quiz.getByRole("button", { name: "إنهاء وحفظ النتيجة", exact: true }).click(),
  ]);
  assert.equal(gradeResponse.status(), 201);
  const grade = await gradeResponse.json();
  assert.equal(grade.attempt.score, 5);
  assert.equal(grade.attempt.total, 5);
  await quiz.getByRole("heading", { name: "5 من 5", exact: true }).waitFor();
  await quiz.getByRole("heading", { name: "5 من 5", exact: true }).scrollIntoViewIfNeeded();
  await quiz.getByRole("checkbox", { name: "الأخطاء فقط", exact: true }).check();
  await quiz.getByText("أحسنت! لا توجد أخطاء.", { exact: true }).waitFor();
  await quiz.getByRole("checkbox", { name: "الأخطاء فقط", exact: true }).uncheck();
  assert.equal(await quiz.getByText("الإجابة الصحيحة", { exact: true }).count(), 5);
  await page.screenshot({ path: `${folder}/quiz-results.png`, fullPage: true, animations: "disabled" });
  const generatedBeforeRetry = generationRequests;
  await quiz.getByRole("button", { name: "إعادة دون توليد جديد", exact: true }).click();
  assert.equal(await quiz.getByRole("radio").count(), 4);
  assert.equal(generationRequests, generatedBeforeRetry);
  checks.push("real cached-source API queue, five-question grading, explanations, mistake filter and zero-generation retry");

  stage("incorrect-feedback-translation-and-retained-attempt");
  await quiz.getByRole("radio").nth(1).check();
  const [feedbackResponse] = await Promise.all([
    page.waitForResponse(response => /\/api\/ai\/quizzes\/\d+\/feedback$/.test(new URL(response.url()).pathname) && response.request().method() === "POST"),
    quiz.getByRole("button", { name: "تحقق من إجابتي واشرحها", exact: true }).click(),
  ]);
  assert.equal(feedbackResponse.status(), 200);
  const feedback = (await feedbackResponse.json()).result;
  assert.equal(feedback.isCorrect, false);
  assert.equal(feedback.correctIndex, 0);
  assert.ok(feedback.explanation.length > 0);
  await quiz.getByText("نراجعها معًا", { exact: true }).waitFor();
  await quiz.getByText("لماذا؟", { exact: true }).waitFor();
  assert.equal(await quiz.getByRole("radio").evaluateAll(nodes => nodes.every(node => node.disabled)), true);
  await quiz.getByRole("button", { name: "إظهار الترجمة", exact: true }).click();
  assert.equal(await quiz.getByRole("button", { name: "النص الأصلي", exact: true }).getAttribute("aria-pressed"), "true");
  // Legacy synthetic questions lack translations: the original must remain usable.
  await quiz.getByText("سؤال اصطناعي 1", { exact: true }).waitFor();
  await quiz.getByRole("button", { name: "علّمه للمراجعة", exact: true }).click();
  await selectTab(names[4]);
  assert.equal(await tutorInput.inputValue(), tutorDraft);
  await selectTab(names[3]);
  assert.equal(await quiz.getByRole("radio").nth(1).isChecked(), true);
  assert.equal(await quiz.getByRole("radio").nth(1).isDisabled(), true);
  assert.equal(await quiz.getByRole("button", { name: "محدد للمراجعة", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(generationRequests, generatedBeforeRetry);
  checks.push("server incorrect-answer feedback locks the answer; translation fallback, bookmarks, attempt and tutor draft persist across tabs");

  stage("responsive-five-tab-layout");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector(".learning-menu")?.getAttribute("aria-expanded") === "false");
  await page.getByRole("button", { name: "إظهار المحتوى", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "إظهار المحتوى", exact: true }).getAttribute("aria-expanded"), "true");
  await page.getByRole("button", { name: "إغلاق قائمة الدروس", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "إظهار المحتوى", exact: true }).getAttribute("aria-expanded"), "false");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    for (const name of names) {
      const panel = await selectTab(name);
      await panel.scrollIntoViewIfNeeded();
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${name}/${width}: no page-wide horizontal overflow`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await selectTab(names[3]);
  await quiz.getByRole("radiogroup").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${folder}/learn-phone.png`, fullPage: true, animations: "disabled" });
  assert.equal(generationRequests, generatedBeforeRetry);
  checks.push("all five panels fit 320/390/768/1440px; phone lesson drawer opens and closes");

  stage("three-standalone-study-tools");
  await page.goto(`${origin}/study-tools`, { waitUntil: "domcontentloaded" });
  const workspaceHeading = page.getByRole("heading", { name: "من المحاضرة إلى الفهم", exact: true });
  await workspaceHeading.waitFor();
  const workspace = workspaceHeading.locator("xpath=ancestor::section[1]");
  const cardNames = ["ملخص منظم", "ترجمة أكاديمية", "اختبر فهمك"];
  for (const name of cardNames) await workspace.getByRole("heading", { level: 3, name, exact: true }).waitFor();
  assert.deepEqual((await workspace.getByRole("heading", { level: 3 }).allTextContents()).map(value => value.trim()), cardNames);
  assert.equal(await workspace.getByRole("textbox").count(), 0, "general tools must not expose a separate tutor/chat composer");
  assert.deepEqual(errors, [], "no client runtime exceptions");
  checks.push("standalone tools expose summary, translation and quiz cards only; tutor stays inside lessons");
  const report = { passed: checks.length + 1, checks: ["job/export ownership enforced over HTTP", ...checks], light, dark, clientExceptions: errors, provider: "cached synthetic test data; no live Gemini; tutor draft/history only", video: "metadata-only fixture; real encrypted playback is checked separately" };
  writeFileSync(`${folder}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await context.close();
} catch (error) {
  // These screenshots contain synthetic data only, never production credentials.
  await page?.screenshot({ path: `${folder}/failure.png`, fullPage: true, animations: "disabled" }).catch(() => undefined);
  writeFileSync(`${folder}/failure.json`, JSON.stringify({ stage: currentStage, clientExceptions: errors }, null, 2));
  throw error;
} finally { await browser.close(); }
