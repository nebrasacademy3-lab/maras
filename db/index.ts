import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseConnectionOptions } from "./connection-options";
import * as coreSchema from "./schema";
import * as geminiSchema from "./gemini-schema";
import * as instructorSchema from "./instructor-schema";
import * as oauthPrivacySchema from "./oauth-privacy-schema";
const schema = { ...coreSchema, ...geminiSchema, ...instructorSchema, ...oauthPrivacySchema };

let pool: Pool | null = null;
let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

function createPool() {
  const requestedMax = Number(process.env.DATABASE_POOL_MAX || 10);
  const max = Number.isFinite(requestedMax) ? Math.min(50, Math.max(2, Math.floor(requestedMax))) : 10;
  const pool = new Pool({
    ...databaseConnectionOptions(),
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  pool.on("error", (error) => console.error("[postgres-pool] idle client error", error));
  return pool;
}

export function getPool() {
  if (!pool) pool = createPool();
  return pool;
}

export function getDb() {
  if (!database) database = drizzle(getPool(), { schema });
  return database;
}

export async function closeDb() {
  if (!pool) return;
  await pool.end();
  pool = null;
  database = null;
}
