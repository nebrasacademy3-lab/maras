import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: ["./db/schema.ts", "./db/gemini-schema.ts", "./db/study-upload-schema.ts", "./db/instructor-schema.ts", "./db/oauth-privacy-schema.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/meras",
  },
  strict: true,
  verbose: true,
});
