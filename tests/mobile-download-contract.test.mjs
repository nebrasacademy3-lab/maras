import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("protected mobile downloads support Expo Web and privileged request routes", async () => {
  const [downloads, proxy, packageJson] = await Promise.all([
    read("mobile/src/lib/downloads.ts"),
    read("proxy.ts"),
    read("mobile/package.json"),
  ]);

  assert.match(downloads, /Platform\.OS === "web"/);
  assert.match(downloads, /URL\.createObjectURL/);
  assert.match(downloads, /Sharing\.shareAsync/);
  assert.match(downloads, /FileSystem\.cacheDirectory \|\| FileSystem\.documentDirectory/);
  assert.match(downloads, /"x-meras-client": "mobile-v1"/);
  assert.match(downloads, /"x-meras-platform": Platform\.OS/);
  assert.doesNotMatch(downloads, /EncodingType\.Base64/);
  assert.match(proxy, /"\/api\/admin\/"/);
  assert.match(proxy, /"\/api\/supervisor\/"/);
  assert.match(proxy, /range,x-meras-client/);
  assert.match(proxy, /x-meras-duration-seconds/);
  assert.match(proxy, /parsed\.protocol === "http:" \|\| parsed\.protocol === "https:"/);
  const dependencies = JSON.parse(packageJson).dependencies;
  const sharingVersion = dependencies["expo-sharing"];
  const expoMajor = dependencies.expo.match(/\d+/)?.[0];
  assert.equal(sharingVersion.match(/\d+/)?.[0], expoMajor, "expo-sharing must target the app's Expo SDK major");
  const lock = JSON.parse(await read("mobile/package-lock.json"));
  assert.equal(lock.packages[""].dependencies["expo-sharing"], sharingVersion, "manifest and lock agree without freezing a patch version");
  assert.equal(lock.packages["node_modules/expo-sharing"].version.split(".")[0], expoMajor);
  assert.match(downloads, /import\("expo-sharing"\)/);
});

test("download names preserve a normal extension without splitting Unicode", async () => {
  const downloads = await read("mobile/src/lib/downloads.ts");
  assert.match(downloads, /Array\.from\(stem\)/);
  assert.match(downloads, /candidate\.match\(\/\\\.\[\\p\{L\}\\p\{N\}\]/);
});

test("institution-wide courses stay inside the student's university on mobile", async () => {
  const courses = await read("mobile/app/(tabs)/courses.tsx");
  assert.match(courses, /course\.audienceScope === "institution"/);
  assert.match(courses, /sameUserUniversity && \(institutionWide \|\| course\.specialty === user\?\.specialty\)/);
  assert.match(courses, /setUniversityOverride\(user\.universitySlug \|\| ALL_UNIVERSITIES\)/);
});

test("mobile learning room lists and securely downloads course resources", async () => {
  const learningRoom = await read("mobile/app/learn/[slug].tsx");
  assert.match(learningRoom, /\/api\/course-resources\?course=/);
  assert.match(learningRoom, /downloadProtectedFile\(\{/);
  assert.match(learningRoom, /path: resource\.downloadUrl/);
  assert.match(learningRoom, /saveToFiles: true/);
});
