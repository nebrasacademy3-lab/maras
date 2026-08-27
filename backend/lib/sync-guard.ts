type WindowEntry = { count: number; resetAt: number };

const SYNC_WINDOW_MS = 60_000;
const MAX_SYNC_REQUESTS = 180;
const MAX_SYNC_CONNECTIONS = 5;
const MAX_TOTAL_SYNC_CONNECTIONS = 2_000;

const windows = new Map<string, WindowEntry>();
const connections = new Map<string, number>();
let activeConnections = 0;
let lastCleanup = 0;

function cleanup(now: number) {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of windows) if (entry.resetAt <= now) windows.delete(key);
}

export function allowSyncRequest(identity: string, limit = MAX_SYNC_REQUESTS, windowMs = SYNC_WINDOW_MS) {
  const now = Date.now();
  cleanup(now);
  const current = windows.get(identity);
  if (!current || current.resetAt <= now) {
    windows.set(identity, { count: 1, resetAt: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

export function acquireSyncConnection(identity: string, limit = MAX_SYNC_CONNECTIONS) {
  const current = connections.get(identity) || 0;
  if (current >= limit || activeConnections >= MAX_TOTAL_SYNC_CONNECTIONS) return null;
  connections.set(identity, current + 1);
  activeConnections += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeConnections = Math.max(0, activeConnections - 1);
    const next = (connections.get(identity) || 1) - 1;
    if (next <= 0) connections.delete(identity);
    else connections.set(identity, next);
  };
}
