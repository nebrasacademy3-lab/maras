import type { VideoPlayer, VideoSource, VideoView } from "expo-video";
/** Native AVPlayer/ExoPlayer receives the per-session Authorization/proof headers. */
export async function replaceLessonVideo(player: VideoPlayer, _view: VideoView | null, source: VideoSource, signal: AbortSignal, _onError: (message:string)=>void): Promise<() => void> {
  signal.throwIfAborted();
  await player.replaceAsync(source);
  signal.throwIfAborted();
  return () => {};
}
