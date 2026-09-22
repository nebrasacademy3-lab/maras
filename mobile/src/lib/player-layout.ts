export function playerStageLayout(width: number, height: number, rotated: boolean) {
  const safeWidth = Number.isFinite(width) ? Math.max(1, width) : 1;
  const safeHeight = Number.isFinite(height) ? Math.max(1, height) : 1;
  return { width: rotated ? safeHeight : safeWidth, height: rotated ? safeWidth : safeHeight, transform: [{ rotate: rotated ? "90deg" as const : "0deg" as const }] };
}

export function inlinePlayerHeight(width: number, height: number) {
  const stage = playerStageLayout(width, height, false);
  return Math.min(stage.width * 9 / 16, stage.height * 0.45);
}

export function playerBackAction(fullscreen: boolean, settingsOpen: boolean) {
  return settingsOpen ? "close-settings" : fullscreen ? "exit-fullscreen" : "leave-player";
}

type CaptureAdapter = { prevent: (key: string) => Promise<void>; allow: (key: string) => Promise<void> };
let captureSequence = 0;
/** Distinct leases prevent a delayed cleanup from unlocking a newly mounted lesson. */
export function createCaptureLease(adapter: CaptureAdapter, prefix = "meras-lesson") {
  const key = `${prefix}-${++captureSequence}`;
  const ready = Promise.resolve().then(() => adapter.prevent(key));
  let release: Promise<void> | null = null;
  return { key, ready, release: () => { release ||= ready.catch(() => undefined).then(() => adapter.allow(key)); return release; } };
}
