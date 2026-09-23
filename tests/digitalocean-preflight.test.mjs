import assert from "node:assert/strict";
import { rootCertificates } from "node:tls";
import { test } from "node:test";
import { digitalOceanPreflight } from "../scripts/digitalocean-preflight.mjs";

const valid = {
  HOSTING_PLATFORM: "digitalocean-app-platform",
  DATABASE_URL: "postgresql://qa:synthetic@private-db.example/maras?sslmode=require",
  DATABASE_SSL: "true",
  DATABASE_SSL_REJECT_UNAUTHORIZED: "true",
  DATABASE_CA_CERT: rootCertificates[0],
  S3_ENDPOINT: "https://fra1.digitaloceanspaces.com",
  S3_REGION: "fra1",
  S3_BUCKET: "meras-private",
  S3_ACCESS_KEY_ID: "synthetic-id",
  S3_SECRET_ACCESS_KEY: "synthetic-key",
  S3_FORCE_PATH_STYLE: "true",
  RUN_DB_MIGRATIONS: "false",
  AUTO_SEED_CATALOG: "false",
  APP_URL: "https://maras.example",
  NEXT_PUBLIC_SITE_URL: "https://maras.example",
  SESSION_SECRET: "synthetic-session-secret-12345678901234567890",
  VIDEO_SIGNING_SECRET: "synthetic-video-secret-12345678901234567890",
  MALWARE_SCAN_TOKEN: "synthetic-scan-token-12345678901234567890",
  MALWARE_SCAN_URL: "http://scanner:3001/scan",
  ADMIN_API_TOKEN: "synthetic-admin-api-token-12345678901234567890",
  ADMIN_UPLOAD_TOKEN: "synthetic-admin-upload-token-12345678901234567890",
  SESSION_COOKIE_SECURE: "true",
  AI_WORKER_ENABLED: "false",
  VIDEO_WORKER_ENABLED: "false",
  STORAGE_CLEANUP_WORKER_ENABLED: "false",
  FILE_SCAN_SCHEDULER_ENABLED: "false",
};

test("DigitalOcean web requires verified database TLS and durable object storage", () => {
  assert.equal(digitalOceanPreflight(valid, "web"), true);
  for (const [key, value, expected] of [
    ["DATABASE_SSL_REJECT_UNAUTHORIZED", "false", "DATABASE_SSL_REJECT_UNAUTHORIZED"],
    ["DATABASE_CA_CERT", "", "DATABASE_CA_CERT"],
    ["SESSION_SECRET", "short", "SESSION_SECRET_LENGTH"],
    ["SESSION_COOKIE_SECURE", "false", "SESSION_COOKIE_SECURE"],
    ["S3_SECRET_ACCESS_KEY", "", "S3_SECRET_ACCESS_KEY"],
    ["S3_ENDPOINT", "http://fra1.digitaloceanspaces.com", "S3_ENDPOINT_FORMAT"],
    ["RUN_DB_MIGRATIONS", "true", "RUN_DB_MIGRATIONS"],
    ["AUTO_SEED_CATALOG", "true", "AUTO_SEED_CATALOG"],
    ["VIDEO_WORKER_ENABLED", "true", "VIDEO_WORKER_ENABLED"],
    ["MALWARE_SCAN_URL", "https://scanner.example/scan", "MALWARE_SCAN_URL"],
  ]) {
    assert.throws(() => digitalOceanPreflight({ ...valid, [key]: value }, "web"), new RegExp(expected));
  }
});

test("DigitalOcean worker and migration validate only their required resources", () => {
  assert.equal(digitalOceanPreflight(valid, "ai-worker"), true);
  assert.equal(digitalOceanPreflight({ ...valid, S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "" }, "migrate"), true);
  assert.throws(() => digitalOceanPreflight({ ...valid, S3_ACCESS_KEY_ID: "" }, "video-worker"), /S3_ACCESS_KEY_ID/);
  assert.throws(() => digitalOceanPreflight({ ...valid, DATABASE_URL: "postgresql:\/\/qa:synthetic@db.example/maras?sslmode=disable" }, "migrate"), /DATABASE_URL_TLS/);
  assert.throws(() => digitalOceanPreflight(valid, "unknown"), /SERVICE/);
});

test("DigitalOcean preflight errors contain setting names, not their contents", () => {
  const bad = { ...valid, S3_SECRET_ACCESS_KEY: "REPLACE_SECRET_TELL_NO_ONE" };
  assert.throws(() => digitalOceanPreflight(bad, "web"), error => {
    assert.match(error.message, /S3_SECRET_ACCESS_KEY/);
    assert.doesNotMatch(error.message, /TELL_NO_ONE/);
    return true;
  });
});
