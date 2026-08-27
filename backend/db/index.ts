import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let pool: Pool | null = null;
let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getConnectionString() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Add the Railway PostgreSQL connection string to the service variables.");
  }
  return connectionString;
}

function createPool() {
  const connectionString = getConnectionString();
  const sslEnabled = process.env.DATABASE_SSL === "true" || /[?&]sslmode=(require|verify-ca|verify-full)/i.test(connectionString);
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: sslEnabled ? { rejectUnauthorized } : undefined,
  });
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
