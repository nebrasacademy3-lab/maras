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
assert.match(player, /enterFullscreen/);
assert.match(learn, /from: "learn"/);
assert.match(course, /from: "course"/);

console.log("video fixes: 10/10 checks passed");
