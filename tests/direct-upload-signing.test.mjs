import assert from "node:assert/strict";
import test from "node:test";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nativeSource } from "./helpers/native-source.mjs";
const policy = await nativeSource("lib/storage-policy.ts");
const env = { S3_ENDPOINT: "https://storage.example.test", S3_BUCKET: "qa-private", S3_ACCESS_KEY_ID: "synthetic", S3_SECRET_ACCESS_KEY: "synthetic-not-a-secret", S3_REGION: "auto" };
const signer = await nativeSource("lib/railway-direct-upload.ts", { ...policy, S3Client, PutObjectCommand, HeadObjectCommand, getSignedUrl, process: { env } });
test("the real SDK signs exact content length, content type and write-once conditions without contacting S3", async () => {
  const url = new URL(await signer.createDirectUploadUrl("private/video-source/course/lesson/file.mp4", "video/mp4", 1234));
  const headers = new Set(url.searchParams.get("X-Amz-SignedHeaders").split(";"));
  for (const header of ["content-type", "content-length", "if-none-match"]) assert.ok(headers.has(header));
  assert.equal(url.host, "storage.example.test"); assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
  for (const size of [0, -1, 0.5, 200 * 1024 * 1024 + 1, Infinity, undefined]) await assert.rejects(signer.createDirectUploadUrl("private/key", "video/mp4", size));
});
