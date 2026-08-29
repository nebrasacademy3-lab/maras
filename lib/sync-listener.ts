import type { PoolClient } from "pg";
import { getPool } from "@/db";
import { invalidateCatalogCache } from "@/lib/catalog-store";
import { invalidatePublicSettingsCache } from "@/lib/platform-settings";
import { SYNC_CHANNELS, type SyncChannel } from "@/lib/sync-snapshot";

type Subscriber = (channel: SyncChannel) => void;
type ListenerState = {
  started: boolean;
  client: PoolClient | null;
  connecting: boolean;
  retryTimer: NodeJS.Timeout | null;
  retryAttempt: number;
  subscribers: Set<Subscriber>;
};

const runtime = globalThis as typeof globalThis & { __merasSyncListener?: ListenerState };
const state = runtime.__merasSyncListener ||= {
  started: false,
  client: null,
  connecting: false,
  retryTimer: null,
  retryAttempt: 0,
  subscribers: new Set<Subscriber>(),
};
if (typeof state.started !== "boolean") state.started = false;
const allowed = new Set<string>(SYNC_CHANNELS);

function emit(channel: SyncChannel) {
  if (channel === "catalog") invalidateCatalogCache();
  if (channel === "settings" || channel === "announcements") invalidatePublicSettingsCache();
  for (const subscriber of state.subscribers) subscriber(channel);
}

function scheduleReconnect() {
  if (state.retryTimer || !state.started || !process.env.DATABASE_URL) return;
  const delay = Math.min(30_000, 1_000 * (2 ** state.retryAttempt));
  state.retryAttempt = Math.min(state.retryAttempt + 1, 5);
  state.retryTimer = setTimeout(() => {
    state.retryTimer = null;
    void ensureListener();
  }, delay);
  state.retryTimer.unref?.();
}

function releaseClient(client: PoolClient) {
  if (state.client !== client) return;
  state.client = null;
  try { client.release(true); } catch { /* The pool may already be closing. */ }
  scheduleReconnect();
}

async function ensureListener() {
  if (state.client || state.connecting || !state.started || !process.env.DATABASE_URL) return;
  state.connecting = true;
  try {
    const client = await getPool().connect();
    state.client = client;
    client.on("notification", (message) => {
      if (message.channel !== "meras_sync" || !message.payload) return;
      try {
        const parsed = JSON.parse(message.payload) as { channel?: unknown };
        if (typeof parsed.channel === "string" && allowed.has(parsed.channel)) emit(parsed.channel as SyncChannel);
      } catch { /* Ignore malformed database notifications. */ }
    });
    client.once("error", () => releaseClient(client));
    await client.query("LISTEN meras_sync");
    state.retryAttempt = 0;
  } catch {
    if (state.client) releaseClient(state.client);
    else scheduleReconnect();
  } finally {
    state.connecting = false;
  }
}

export function subscribeSyncNotifications(subscriber: Subscriber) {
  state.started = true;
  state.subscribers.add(subscriber);
  void ensureListener();
  return () => state.subscribers.delete(subscriber);
}

export function startSyncListener() {
  state.started = true;
  void ensureListener();
}
