import { defineConfig } from "drizzle-kit";
import { drizzleConnectionOptions } from "./db/connection-options";

export default defineConfig({
  out: "./drizzle",
  schema: ["./db/schema.ts", "./db/gemini-schema.ts", "./db/study-upload-schema.ts", "./db/instructor-schema.ts", "./db/oauth-privacy-schema.ts"],
  dialect: "postgresql",
  dbCredentials: drizzleConnectionOptions({ ...process.env, DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/meras" }),
  strict: true,
  verbose: true,
});
