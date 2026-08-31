import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const player = await read("./app/lesson/[courseSlug]/[lessonId].tsx");
const learn = await read("./app/learn/[slug].tsx");
const course = await read("./app/course/[slug].tsx");

assert.match(player, /contentFit="contain"/);
assert.match(player, /surfaceType: "textureView"/);
assert.match(player, /headers\.Authorization = `Bearer \$\{token\}`/);
assert.match(player, /router\.dismissTo\(returnHref/);
assert.match(player, /BackHandler\.addEventListener\("hardwareBackPress"/);
assert.match(player, /player\.replaceAsync\(null\)/);
assert.match(player, /settingsOpen/);
assert.match(player, /<Modal visible/);
assert.match(player, /presentationStyle="fullScreen"/);
assert.match(player, /nativeControls=\{false\}/);
assert.match(player, /fullscreenOptions=\{\{ enable: false \}\}/);
assert.match(player, /preventScreenCaptureAsync\("meras-lesson"\)/);
assert.match(player, /transform: \[\{ rotate: "90deg" as const \}\]/);
assert.match(learn, /from: "learn"/);
assert.match(course, /from: "course"/);

console.log("video fixes: 15/15 checks passed");
