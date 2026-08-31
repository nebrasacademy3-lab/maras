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
  assert.doesNotMatch(downloads, /EncodingType\.Base64/);
  assert.match(proxy, /"\/api\/admin\/"/);
  assert.match(proxy, /"\/api\/supervisor\/"/);
  assert.match(proxy, /range,x-meras-client/);
  assert.match(proxy, /x-meras-duration-seconds/);
  assert.match(proxy, /parsed\.protocol === "http:" \|\| parsed\.protocol === "https:"/);
  assert.equal(JSON.parse(packageJson).dependencies["expo-sharing"], "~57.0.16");
});

test("download names preserve a normal extension without splitting Unicode", async () => {
  const downloads = await read("mobile/src/lib/downloads.ts");
  assert.match(downloads, /Array\.from\(stem\)/);
  assert.match(downloads, /candidate\.match\(\/\\\.\[\\p\{L\}\\p\{N\}\]/);
});
