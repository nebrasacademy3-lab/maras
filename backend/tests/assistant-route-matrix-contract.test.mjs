import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

async function importTypescript(relative) {
  const source = await read(relative);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const [{ resolveAssistantRoute, sanitizeAssistantCourseQuery }, { safeInternalHref }] = await Promise.all([
  importTypescript("../mobile/src/lib/assistantRoute.ts"),
  importTypescript("lib/assistant-ai.ts"),
]);

test("Expo assistant actions resolve to their semantic native screens", () => {
  const matrix = [
    ["/", "/(tabs)"],
    ["/dashboard", "/(tabs)"],
    ["/dashboard?view=overview", "/(tabs)"],
    ["/dashboard?view=courses", "/(tabs)/learning"],
    ["/dashboard?view=learning", "/(tabs)/learning"],
    ["/dashboard?view=requests", "/requests"],
    ["/dashboard?view=orders", "/orders"],
    ["/dashboard?view=notifications", "/notifications"],
    ["/dashboard?view=support", "/support"],
    ["/dashboard?view=account", "/(tabs)/account"],
    ["/forgot-password", "/forgot-password"],
    ["/cart", "/cart"],
    ["/favorites", "/favorites"],
    ["/request-course", "/requests"],
    ["/login", "/(auth)/login"],
    ["/register", "/(auth)/register"],
    ["/universities", "/(tabs)/universities"],
    ["/notifications", "/notifications"],
    ["/support", "/support"],
    ["/contact", "/contact"],
    ["/terms", "/terms"],
    ["/privacy", "/privacy"],
    ["/content-policy", "/content-policy"],
    ["/refund-policy", "/refund-policy"],
    ["/how-it-works", "/how-it-works"],
    ["/accessibility", "/accessibility"],
    ["/supervisor?view=requests", "/supervisor"],
    ["/admin", "/admin"],
  ];
  for (const [web, native] of matrix) assert.equal(resolveAssistantRoute(web), native, `${web} mapped incorrectly`);

  assert.deepEqual(resolveAssistantRoute("/courses/calculus-101"), { pathname: "/course/[slug]", params: { slug: "calculus-101" } });
  assert.deepEqual(resolveAssistantRoute("/learn/calculus-101"), { pathname: "/learn/[slug]", params: { slug: "calculus-101" } });
  assert.deepEqual(resolveAssistantRoute("/universities/ksu"), { pathname: "/university/[slug]", params: { slug: "ksu" } });
});

test("catalog queries survive assistant navigation only after normalization", () => {
  assert.deepEqual(resolveAssistantRoute("/courses?q=%D9%87%D9%86%D8%AF%D8%B3%D8%A9+%D8%A7%D9%84%D8%A8%D8%B1%D9%85%D8%AC%D9%8A%D8%A7%D8%AA"), {
    pathname: "/(tabs)/courses",
    params: { q: "هندسة البرمجيات" },
  });
  assert.equal(sanitizeAssistantCourseQuery("  نظم\u0000   المعلومات\u0007 "), "نظم المعلومات");
  assert.equal(sanitizeAssistantCourseQuery(["  رياضيات  ", "ignored"]), "رياضيات");
  assert.equal(sanitizeAssistantCourseQuery("أ".repeat(140)).length, 120);

  return Promise.all([
    read("../mobile/app/(tabs)/courses.tsx").then((source) => {
      assert.match(source, /useLocalSearchParams/);
      assert.match(source, /sanitizeAssistantCourseQuery\(params\.q\)/);
      assert.match(source, /search\.source === routedQuery/);
    }),
  ]);
});

test("native and server assistant allowlists reject malformed internal actions", () => {
  for (const invalid of [
    "//evil.example",
    "/\\evil.example",
    "/dashboard?view=orders&next=/admin",
    "/dashboard?view=unknown",
    "/terms?next=/admin",
    "/courses?q=one&q=two",
    "/courses/%2e%2e",
    "/courses/a/b",
    "/privacy#section",
    "/support\u0000",
    "javascript:alert(1)",
  ]) {
    assert.equal(resolveAssistantRoute(invalid), null, `Expo accepted unsafe action: ${invalid}`);
    assert.equal(safeInternalHref(invalid, null), false, `server accepted unsafe action: ${invalid}`);
  }

  assert.equal(safeInternalHref("/cart", null), true);
  assert.equal(safeInternalHref("/favorites", null), true);
  assert.equal(safeInternalHref("/courses?q=%D9%87%D9%86%D8%AF%D8%B3%D8%A9", null), true);
  assert.equal(safeInternalHref("/admin", null), false);
  assert.equal(safeInternalHref("/admin", { role: "admin" }), true);
  assert.equal(safeInternalHref("/supervisor", { role: "student" }), false);
  assert.equal(safeInternalHref("/supervisor?view=requests", { role: "supervisor" }), true);
});

test("every policy and information action has an Arabic native screen", async () => {
  const [component, ...routes] = await Promise.all([
    read("../mobile/src/components/InformationPage.tsx"),
    ...["terms", "privacy", "content-policy", "refund-policy", "how-it-works", "accessibility"].map((route) => read(`../mobile/app/${route}.tsx`)),
  ]);
  for (const title of ["الشروط والأحكام", "سياسة الخصوصية", "حقوق وسياسة المحتوى", "سياسة الاسترداد", "كيف تعمل مراس؟", "إمكانية الوصول"]) assert.match(component, new RegExp(title.replace("?", "\\?")));
  for (const route of routes) assert.match(route, /InformationPage kind=/);
});
