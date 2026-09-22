import type { VideoPlayer, VideoSource, VideoView } from "expo-video";
import { apiRequestUrl } from "./api";
/** Use the documented web nativeRef so Expo retains its status/progress/control listeners. */
export async function replaceLessonVideo(player: VideoPlayer, view: VideoView | null, source: VideoSource, signal: AbortSignal, onError: (message:string)=>void): Promise<() => void> {
  signal.throwIfAborted();
  const video = view?.nativeRef.current as HTMLVideoElement | null;
  const uri = typeof source === "string" ? source : typeof source === "object" ? source?.uri : undefined;
  if (!video || !uri || !new URL(uri).pathname.endsWith(".m3u8")) throw new Error("البث المشفر غير جاهز؛ أعد فتح الدرس");
  apiRequestUrl(uri);
  video.controls = false; video.setAttribute("controlslist", "nodownload noremoteplayback nofullscreen"); video.disablePictureInPicture = true; video.disableRemotePlayback = true;
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    await player.replaceAsync(source); signal.throwIfAborted(); return () => {};
  }
  const {default:Hls} = await import("hls.js"); signal.throwIfAborted();
  if (!Hls.isSupported()) throw new Error("هذا المتصفح لا يدعم البث المشفر؛ استخدم إصدارًا حديثًا من Safari أو Chrome أو Firefox");
  await player.replaceAsync(null); player.pause(); signal.throwIfAborted();
  const headers = typeof source === "object" && source ? source.headers : undefined;
  const hls = new Hls({enableWorker:true,backBufferLength:30,maxBufferLength:30,xhrSetup:(xhr,url)=>{apiRequestUrl(url);xhr.withCredentials=true;for(const [key,value] of Object.entries(headers||{}))xhr.setRequestHeader(key,value);}});
  const dispose=()=>{hls.destroy();signal.removeEventListener("abort",dispose);};
  signal.addEventListener("abort",dispose,{once:true});
  hls.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal&&!signal.aborted){player.pause();onError("تعذر تشغيل البث المشفر؛ أعد المحاولة لتجديد الجلسة.");}});
  hls.attachMedia(video); hls.loadSource(uri);
  return dispose;
}
