import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sql, and, eq } from "drizzle-orm";
import { pgTable, text, PgDialect } from "drizzle-orm/pg-core";
import { isolated } from "./helpers/business-fixtures.mjs";
import { loadMobileRouting } from "./mobile-routing-harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(join(here, "..", relative), "utf8");
const knowledge = await read("lib/assistant-knowledge.ts");
const ai = await read("lib/assistant-ai.ts");
const context = await read("lib/assistant-context.ts");
const route = await read("app/api/assistant/route.ts");
const web = await read("components/meras-assistant.tsx");
const mobile = await read("mobile/app/assistant.tsx");
const courseAccess = pgTable("course_access", {
  userEmail: text("user_email"), courseSlug: text("course_slug"), suspendedAt: text("suspended_at"),
  source: text("source"), revokedAt: text("revoked_at"), startsAt: text("starts_at"),
  expiresAt: text("expires_at"), storeAccessBlockedAt: text("store_access_blocked_at"),
});
const access = await isolated("../lib/course-access.ts", { sql, and, eq, courseAccess });

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
  const instant = "2026-09-12T12:00:00.000Z";
  const query = new PgDialect().sqlToQuery(access.activeUserAccessWhere("private-user@example.test", instant));
  const predicate = query.sql.replace(/\s+/g, " ");
  assert.ok(query.params.includes("private-user@example.test"));
  assert.ok(!predicate.includes("private-user@example.test"), "identity is bound as a parameter");
  assert.match(predicate, /"user_email" = \$\d+/);
  assert.match(predicate, /"suspended_at" IS NULL AND \(/, "global suspension gates both baseline and store rights");
  assert.match(predicate, /"revoked_at" IS NULL/);
  assert.match(predicate, /"starts_at"::timestamptz<=\$\d+::timestamptz/);
  assert.match(predicate, /"expires_at" IS NULL OR "course_access"\."expires_at"::timestamptz>\$\d+::timestamptz/);
  assert.match(predicate, /"store_access_blocked_at" IS NULL AND EXISTS/);
  assert.match(predicate, /access_grant\.user_email="course_access"\."user_email"/);
  assert.match(predicate, /access_grant\.course_slug="course_access"\."course_slug"/);
  assert.match(predicate, /access_grant\.status='active'/);
  assert.match(predicate, /access_grant\.expires_at IS NULL OR access_grant\.expires_at::timestamptz>\$\d+::timestamptz/);
  assert.ok(query.params.filter(value => value === instant).length >= 4);
});

test("lesson-specific questions outrank a simultaneous course match", () => {
  assert.match(knowledge, /preferLesson[\s\S]*intent === "learning"/);
  assert.match(knowledge, /if \(matchedCourse && !preferLesson\)/);
});

test("web and Expo expose the same answer actions and suggestions", async () => {
  assert.match(web, /message\.suggestions/);
  assert.match(web, /message\.actions/);
  assert.match(mobile, /reply\.suggestions/);
  assert.match(mobile, /reply\.actions/);
  assert.match(mobile, /const route = resolveMobileRoute\(href\)/);
  const { resolveMobileRoute } = await loadMobileRouting();
  const course = resolveMobileRoute("/courses/math#preview");
  assert.equal(course.pathname, "/course/[slug]");
  assert.equal(course.params.slug, "math");
  assert.equal(resolveMobileRoute("/dashboard?view=orders#latest"), "/orders");
});
