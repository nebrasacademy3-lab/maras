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
type CaptureGroup = { users: number; nativeKey: string | null; tail: Promise<void>; blocked: boolean };
const captureGroups = new WeakMap<CaptureAdapter["prevent"], WeakMap<CaptureAdapter["allow"], CaptureGroup>>();
/** A single native protection call spans overlapping screens. Some iOS SDKs are
 * not reentrant: calling prevent twice can corrupt the protected layer tree. */
export function createCaptureLease(adapter: CaptureAdapter, prefix = "meras-lesson") {
  const key = `${prefix}-${++captureSequence}`;
  let byAllow = captureGroups.get(adapter.prevent);
  if (!byAllow) { byAllow = new WeakMap(); captureGroups.set(adapter.prevent, byAllow); }
  let group = byAllow.get(adapter.allow);
  if (!group) { group = { users: 0, nativeKey: null, tail: Promise.resolve(), blocked: false }; byAllow.set(adapter.allow, group); }
  const state = group;
  const queue = (action: () => Promise<void>) => {
    const next = state.tail.then(action);
    state.tail = next.then(() => undefined, () => undefined);
    return next;
  };
  let acquired = false;
  const ready = queue(async () => {
    if (state.blocked) throw new Error("تعذر إعادة تهيئة حماية الشاشة. أغلق التطبيق وافتحه مجددًا.");
    if (!state.users) {
      try { await adapter.prevent(key); state.nativeKey = key; }
      catch (error) {
        // Expo may retain its key after a failed native call. Clear it once.
        try { await adapter.allow(key); } catch { state.blocked = true; }
        throw error;
      }
    }
    state.users++; acquired = true;
  });
  let released: Promise<void> | null = null;
  return { key, ready, release: () => {
    released ||= queue(async () => {
      if (!acquired) return;
      acquired = false; state.users--;
      if (!state.users && state.nativeKey) {
        try { await adapter.allow(state.nativeKey); state.nativeKey = null; }
        catch (error) { state.blocked = true; throw error; }
      }
    });
    return released;
  } };
}
