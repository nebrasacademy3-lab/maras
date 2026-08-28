import { createHash } from "node:crypto";
import { and, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { syncRevisions } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";

export const SYNC_CHANNELS = [
  "catalog",
  "settings",
  "announcements",
  "account",
  "commerce",
  "support",
  "notifications",
  "requests",
  "supervisor",
  "admin",
] as const;

export type SyncChannel = (typeof SYNC_CHANNELS)[number];
export type SyncSnapshot = {
  ok: true;
  version: string;
  serverTime: string;
  channels: Record<string, string>;
};

export function syncChannelsForUser(user: SessionUser | null): SyncChannel[] {
  const channels: SyncChannel[] = ["catalog", "settings", "announcements"];
  if (!user) return channels;
  if (user.role === "student") channels.push("account", "commerce", "support", "notifications", "requests");
  if (user.role === "supervisor") channels.push("account", "support", "notifications", "supervisor");
  if (user.role === "admin") channels.push("account", "support", "notifications", "admin");
  return channels;
}

function digest(channel: string, values: Array<{ scopeKey: string; version: number }>) {
  const source = values
    .sort((left, right) => left.scopeKey.localeCompare(right.scopeKey))
    .map((row) => `${row.scopeKey}:${row.version}`)
    .join("|");
  return createHash("sha256").update(`${channel}|${source || "0"}`).digest("base64url").slice(0, 18);
}

export async function getSyncSnapshot(user: SessionUser | null): Promise<SyncSnapshot> {
  const channels = syncChannelsForUser(user);
  const scopes = ["*"];
  if (user) scopes.push(`user:${user.id}`, `email:${user.email.toLowerCase()}`, `role:${user.role}`);
  else scopes.push("role:public");

  const rows = await getDb().select({
    channel: syncRevisions.channel,
    scopeKey: syncRevisions.scopeKey,
    version: syncRevisions.version,
  }).from(syncRevisions).where(and(
    inArray(syncRevisions.channel, channels),
    inArray(syncRevisions.scopeKey, scopes),
  ));

  const grouped = new Map<string, Array<{ scopeKey: string; version: number }>>();
  for (const row of rows) grouped.set(row.channel, [...(grouped.get(row.channel) || []), row]);
  const signatures = Object.fromEntries(channels.map((channel) => [channel, digest(channel, grouped.get(channel) || [])]));
  return {
    ok: true,
    version: signatures.catalog || "0",
    serverTime: new Date().toISOString(),
    channels: signatures,
  };
}
