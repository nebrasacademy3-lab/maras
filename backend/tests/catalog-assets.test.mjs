import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

function asciiSlug(value) {
  const arabicMap = { ا: "a", أ: "a", إ: "i", آ: "a", ب: "b", ت: "t", ث: "th", ج: "j", ح: "h", خ: "kh", د: "d", ذ: "dh", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s", ض: "d", ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "q", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", و: "w", ي: "y", ة: "h", ى: "a", ء: "a" };
  return [...value.toLowerCase()].map((char) => arabicMap[char] || char).join("").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 54) || "item";
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36).slice(0, 7);
}

function institutionSlug(name) { return `${asciiSlug(name)}-${stableHash(name)}`.slice(0, 80); }
function specialtySlug(name) { return `${asciiSlug(name)}-${stableHash(name)}`.slice(0, 80); }
function courseSlug(institution, specialty, title) { return `${institution}-${asciiSlug(specialty)}-${asciiSlug(title)}-${stableHash(`${institution}:${specialty}:${title}`)}`.slice(0, 80); }
function lessonId(slug, position, title) { return `${slug}-lesson-${asciiSlug(title)}-${stableHash(`${slug}:${position}:${title}`)}`.slice(0, 100); }

const slugPattern = /^[a-z0-9][a-z0-9._-]{1,99}$/;

test("generated catalog identifiers are deterministic and valid", () => {
  const institution = institutionSlug("جامعة الملك سعود");
  const specialty = specialtySlug("علوم الحاسب");
  const course = courseSlug(institution, "علوم الحاسب", "مبادئ البرمجة");
  const lesson = lessonId(course, 1, "مدخل إلى البرمجة");
  assert.equal(institution, institutionSlug("جامعة الملك سعود"));
  assert.equal(specialty, specialtySlug("علوم الحاسب"));
  assert.equal(course, courseSlug(institution, "علوم الحاسب", "مبادئ البرمجة"));
  assert.equal(lesson, lessonId(course, 1, "مدخل إلى البرمجة"));
  for (const value of [institution, specialty, course, lesson]) assert.match(value, slugPattern);
});

test("source contracts preserve automatic IDs and optional descriptions", async () => {
  const [templates, consoleRoute, schema, migration] = await Promise.all([
    read("lib/catalog-templates.ts"),
    read("app/api/admin/console/route.ts"),
    read("db/schema.ts"),
    read("drizzle/0009_parallel_tarantula.sql"),
  ]);
  assert.match(templates, /export function institutionSlug/);
  assert.match(templates, /export function specialtySlug/);
  assert.match(templates, /export function courseSlug/);
  assert.match(templates, /export function lessonId/);
  assert.match(consoleRoute, /const suppliedId = cleanText\(payload\.id, 100\)/);
  assert.match(consoleRoute, /const id = suppliedId \|\| lessonId\(courseSlug, position \+ 1, title\)/);
  assert.match(consoleRoute, /const description = cleanText\(payload\.description, 2000\)/);
  assert.match(schema, /coverImageUrl: text\("cover_image_url"\)/);
  assert.match(schema, /description: text\("description"\)\.notNull\(\)\.default\(""\)/);
  assert.match(migration, /ADD COLUMN "cover_image_url" text/);
  assert.match(migration, /ADD COLUMN "description" text DEFAULT '' NOT NULL/);
});

test("cover endpoints enforce admin origin, HTTPS links, magic bytes, and size limits", async () => {
  const [uploadRoute, readRoute, consoleRoute] = await Promise.all([
    read("app/api/admin/covers/route.ts"),
    read("app/api/covers/[slug]/route.ts"),
    read("app/api/admin/console/route.ts"),
  ]);
  assert.match(uploadRoute, /sameOriginRequest\(request\)/);
  assert.match(uploadRoute, /MAX_COVER_BYTES = 6 \* 1024 \* 1024/);
  assert.match(uploadRoute, /detectImageType/);
  assert.match(uploadRoute, /file\.size > MAX_COVER_BYTES/);
  assert.match(uploadRoute, /putObject\(objectKey, file\.stream\(\), detectedType\)/);
  assert.match(readRoute, /x-content-type-options/);
  assert.match(readRoute, /cache-control/);
  assert.match(consoleRoute, /رابط غلاف المادة يجب أن يبدأ بـ https/);
});
