import assert from "node:assert/strict";
import { rootCertificates } from "node:tls";
import { test } from "node:test";
import { tsImport } from "tsx/esm/api";

const { databaseConnectionOptions, drizzleConnectionOptions } = await tsImport("../db/connection-options.ts", import.meta.url);
const url = "postgresql://user:synthetic@private-db.example:25060/maras?sslmode=require";
const verified = { DATABASE_URL: url, DATABASE_SSL: "true", DATABASE_SSL_REJECT_UNAUTHORIZED: "true", DATABASE_CA_CERT: rootCertificates[0] };

test("DigitalOcean PostgreSQL CA reaches both app pool and Drizzle migration", () => {
  const runtime = databaseConnectionOptions(verified);
  assert.equal(runtime.host, "private-db.example");
  assert.equal(runtime.port, 25060);
  assert.equal(runtime.password, "synthetic");
  assert.equal(runtime.ssl.ca, rootCertificates[0]);
  assert.equal(runtime.ssl.rejectUnauthorized, true);
  assert.equal("connectionString" in runtime, false);
  const migrate = drizzleConnectionOptions(verified);
  assert.equal(migrate.host, "private-db.example");
  assert.equal(migrate.ssl.ca, rootCertificates[0]);
  assert.equal(migrate.ssl.rejectUnauthorized, true);
});

test("verified CA rejects disabled TLS and conflicting URL TLS options", () => {
  assert.throws(() => databaseConnectionOptions({ ...verified, DATABASE_SSL_REJECT_UNAUTHORIZED: "false" }), /Verified database TLS/);
  assert.throws(() => databaseConnectionOptions({ ...verified, DATABASE_CA_CERT: "garbage" }), /DATABASE_CA_CERT/);
  assert.throws(() => databaseConnectionOptions({ ...verified, DATABASE_CA_CERT: "" , HOSTING_PLATFORM: "digitalocean-app-platform" }), /DigitalOcean requires verified database TLS/);
  assert.throws(() => databaseConnectionOptions({ ...verified, DATABASE_URL: url + "&ssl=no-verify" }), /Unsupported DATABASE_URL/);
  assert.throws(() => databaseConnectionOptions({ ...verified, DATABASE_URL: url.replace("sslmode=require", "sslmode=disable") }), /Invalid sslmode/);
});

test("existing connection strings retain the previous no-CA behavior", () => {
  const old = databaseConnectionOptions({ DATABASE_URL: "postgresql://qa:synthetic@localhost/qa", DATABASE_SSL: "false" });
  assert.equal(old.connectionString, "postgresql://qa:synthetic@localhost/qa");
  assert.equal(old.ssl, undefined);
  assert.deepEqual(drizzleConnectionOptions({ DATABASE_URL: old.connectionString }), { url: old.connectionString });
});
