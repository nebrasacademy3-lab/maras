import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(join(here, "..", relative), "utf8");
const knowledge = await read("lib/assistant-knowledge.ts");
const ai = await read("lib/assistant-ai.ts");
const context = await read("lib/assistant-context.ts");
const route = await read("app/api/assistant/route.ts");
const web = await read("components/meras-assistant.tsx");
const mobile = await read("mobile/app/assistant.tsx");
const access = await read("lib/course-access.ts");

test("assistant understands a broad Arabic intent vocabulary and has detailed fallbacks", () => {
  assert.match(knowledge, /export type AssistantIntent/);
  for (const term of ["registration", "course_request", "cart_favorites", "notifications", "appearance", "security", "learning"]) assert.match(knowledge, new RegExp(`\\"${term}\\"`));
  assert.match(knowledge, /خطوات:|خطوة عملية|intentFallback/);
  assert.match(knowledge, /إجمالي 100 ميجابايت/);
});

test("model responses are instructed to be structured, detailed, and safe", () => {
  assert.match(ai, /إجابة.*مفصلة/);
  assert.match(ai, /سؤال توضيح واحد/);
  assert.match(ai, /لا تكشف.*السياق الخام/);
  assert.match(ai, /answer.*4800/);
  assert.match(ai, /type: "json_schema"/);
  assert.match(ai, /strict: true/);
  assert.match(ai, /additionalProperties: false/);
  assert.match(ai, /reasoning_effort: "minimal"/);
  assert.match(ai, /"\/cart", "\/favorites", "\/checkout"/);
});

test("private support context is scoped to the current user's tickets", () => {
  assert.match(context, /inArray\(supportReplies\.ticketId, ticketRows\.map/);
  assert.match(context, /supportTickets\.userEmail/);
  assert.match(route, /detectAssistantIntent\(question\)/);
  assert.match(route, /intent/);
});

test("live retrieval stays ahead of bounded, active account context", () => {
  assert.match(context, /formatRetrievedContext[\s\S]*\.slice\(0, 9_000\)/);
  assert.match(context, /privateContext\.slice\(0, 5_000\)/);
  assert.ok(context.indexOf("${retrieved}") < context.indexOf("${boundedPrivateContext}"));
  assert.match(context, /activeUserAccessWhere\(user\.email, now\)/);
  assert.match(access, /isNull\(courseAccess\.suspendedAt\)/);
  assert.match(access, /gt\(courseAccess\.expiresAt, now\)/);
});

test("lesson-specific questions outrank a simultaneous course match", () => {
  assert.match(knowledge, /preferLesson[\s\S]*intent === "learning"/);
  assert.match(knowledge, /if \(matchedCourse && !preferLesson\)/);
});

test("web and Expo expose the same answer actions and suggestions", () => {
  assert.match(web, /message\.suggestions/);
  assert.match(web, /message\.actions/);
  assert.match(mobile, /reply\.suggestions/);
  assert.match(mobile, /reply\.actions/);
  assert.match(mobile, /mobileRoute/);
});
