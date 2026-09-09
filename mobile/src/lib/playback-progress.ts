export type PlaybackSnapshot = { currentTime: number; duration: number };

const safeSeconds = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

/** Store JS values only: native players may already be released during cleanup. */
export function playbackSnapshot(currentTime: number, duration: number): PlaybackSnapshot {
  const safeDuration = safeSeconds(duration);
  const safeTime = safeSeconds(currentTime);
  return { currentTime: safeDuration > 0 ? Math.min(safeTime, safeDuration) : safeTime, duration: safeDuration };
}

export function progressFromSnapshot(snapshot: PlaybackSnapshot) {
  const safe = playbackSnapshot(snapshot.currentTime, snapshot.duration);
  return { watchedSeconds: Math.floor(safe.currentTime), completed: safe.duration > 0 && safe.currentTime / safe.duration >= 0.9 };
}
