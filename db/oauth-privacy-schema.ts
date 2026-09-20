import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./schema";
// A deleted account retains only an encrypted token until Apple revocation succeeds.
export const appleAccountTokens = pgTable("apple_account_tokens", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "restrict" }),
  clientId: text("client_id").notNull(), ciphertext: text("ciphertext").notNull(),
  status: text("status").notNull().default("active"), attempts: integer("attempts").notNull().default(0),
  nextRetryAt: text("next_retry_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [index("apple_token_retry_idx").on(t.status, t.nextRetryAt)]);
