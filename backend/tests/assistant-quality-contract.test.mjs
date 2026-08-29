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
const mobile = await read("../mobile/app/assistant.tsx");

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
  assert.match(ai, /response_format: \{ type: "json_object" \}/);
});

test("private support context is scoped to the current user's tickets", () => {
  assert.match(context, /inArray\(supportReplies\.ticketId, ticketRows\.map/);
  assert.match(context, /supportTickets\.userEmail/);
  assert.match(route, /detectAssistantIntent\(question\)/);
  assert.match(route, /intent/);
});

test("web and Expo expose the same answer actions and suggestions", () => {
  assert.match(web, /message\.suggestions/);
  assert.match(web, /message\.actions/);
  assert.match(mobile, /reply\.suggestions/);
  assert.match(mobile, /reply\.actions/);
  assert.match(mobile, /openInternalRoute/);
});
