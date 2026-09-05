"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Gauge, LoaderCircle, Maximize, Minimize, Pause, Play, RefreshCw, RotateCcw, RotateCw, Settings, ShieldCheck, Volume1, Volume2, VolumeX } from "lucide-react";
import { BrandLockup } from "./brand-logo";
import { usePlayerFullscreen } from "./use-player-fullscreen";
import "./secure-video-player.css";

export type VideoSeekRequest = { seconds: number; nonce: number };
type SessionQuality = { label: string; width: number; height: number; bitrateKbps: number };
type SessionProcessing = { status: string; progress: number | null; message: string };
type SessionResponse = { streamUrl?: string; sourceUrl?: string; hlsUrl?: string; thumbnailUrl?: string; adaptive?: boolean; qualities?: SessionQuality[]; expiresAt?: string; processing?: SessionProcessing; error?: string };
type Props = {
  title: string;
  studentLabel?: string;
  preview?: boolean;
  source?: string;
  courseSlug?: string;
  lessonId?: string;
  seekRequest?: VideoSeekRequest | null;
  onTimeChange?: (seconds: number) => void;
};

const formatTime = (value: number) => {
  if (!Number.isFinite(value)) return "00:00";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export function SecureVideoPlayer({ title, studentLabel = "طالب مراس", preview = false, source, courseSlug, lessonId, seekRequest, onTimeChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hlsEngineRef = useRef<{ destroy: () => void } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [quality, setQuality] = useState(source ? "الأصلية" : "تلقائي");
  const [settings, setSettings] = useState(false);
  const [watermark, setWatermark] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [streamSource, setStreamSource] = useState(source || "");
  const [originalSource, setOriginalSource] = useState(source || "");
  const [managedHls, setManagedHls] = useState(false);
  const [posterSource, setPosterSource] = useState("");
  const [qualitySources, setQualitySources] = useState<Record<string, string>>(source ? { "الأصلية": source } : {});
  const [sessionLoading, setSessionLoading] = useState(Boolean(!source && courseSlug && lessonId));
  const [sessionError, setSessionError] = useState("");
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [processing, setProcessing] = useState<SessionProcessing | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState("");
  const { fullscreen, fallbackFullscreen, rotated, toggleRotation, toggle: fullScreen, close: closeFullscreen, message: fullscreenMessage } = usePlayerFullscreen(shellRef);
  const [playbackMessage, setPlaybackMessage] = useState("");
  const [privacyCovered, setPrivacyCovered] = useState(false);
  const lastSavedRef = useRef(0);
  const pendingPlaybackRef = useRef<{ seconds: number; playing: boolean } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setWatermark((value) => (value + 1) % 4), 9000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (preview) return;
    const hide = () => { if (document.hidden) { setPrivacyCovered(true); videoRef.current?.pause(); } else window.setTimeout(() => setPrivacyCovered(false), 180); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [preview]);

  useEffect(() => {
    if (source || !courseSlug || !lessonId) return;
    const controller = new AbortController();
    const loadSession = async () => {
      setSessionLoading(true);
      setSessionError("");
      setHasError(false);
      try {
        const response = await fetch("/api/video/session", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", "x-meras-platform": "web" },
          body: JSON.stringify({ courseSlug, lessonId }),
          signal: controller.signal,
        });
        const data = await response.json() as SessionResponse;
        setProcessing(data.processing || null);
        setSessionExpiresAt(data.expiresAt || "");
        if (!response.ok || !data.streamUrl) throw new Error(data.error || (data.processing && ["queued", "processing"].includes(data.processing.status) ? data.processing.message : "تعذر إنشاء جلسة المشاهدة"));
        const supportsNativeHls = Boolean(data.hlsUrl && videoRef.current?.canPlayType("application/vnd.apple.mpegurl"));
        const supportsManagedHls = Boolean(data.hlsUrl && typeof window.MediaSource !== "undefined");
        const adaptivePlayback = supportsNativeHls || supportsManagedHls;
        const sources: Record<string, string> = { "الأصلية": data.sourceUrl || data.streamUrl };
        if (adaptivePlayback && data.hlsUrl) {
          sources["تلقائي"] = data.hlsUrl;
          for (const item of data.qualities || []) sources[item.label] = data.hlsUrl.replace(/\/master\.m3u8(?=\?|$)/, `/${item.label}/index.m3u8`);
        }
        setQualitySources(sources);
        setQuality(adaptivePlayback ? "تلقائي" : "الأصلية");
        setPosterSource(data.thumbnailUrl || "");
        setOriginalSource(data.sourceUrl || data.streamUrl);
        setManagedHls(Boolean(supportsManagedHls && !supportsNativeHls));
        setStreamSource(adaptivePlayback && data.hlsUrl ? data.hlsUrl : data.sourceUrl || data.streamUrl);
        setSessionLoading(false);
      } catch (caught) {
        if ((caught as Error).name === "AbortError") return;
        setSessionError(caught instanceof Error ? caught.message : "تعذر إنشاء جلسة المشاهدة");
        setSessionLoading(false);
      }
    };
    void loadSession();
    return () => controller.abort();
  }, [courseSlug, lessonId, sessionAttempt, source]);

  useEffect(() => {
    if (!sessionExpiresAt || source) return;
    const remaining = Date.parse(sessionExpiresAt) - Date.now() - 2 * 60_000;
    if (!Number.isFinite(remaining)) return;
    const timer = window.setTimeout(() => {
      const video = videoRef.current;
      pendingPlaybackRef.current = video ? { seconds: video.currentTime, playing: !video.paused } : null;
      setSessionAttempt((value) => value + 1);
    }, Math.max(30_000, remaining));
    return () => window.clearTimeout(timer);
  }, [sessionExpiresAt, source]);

  useEffect(() => {
    const video = videoRef.current;
    if (!managedHls || !video || !streamSource) {
      hlsEngineRef.current?.destroy();
      hlsEngineRef.current = null;
      return;
    }
    let disposed = false;
    const fallback = () => {
      if (disposed || !originalSource) return;
      if (!pendingPlaybackRef.current) pendingPlaybackRef.current = { seconds: video.currentTime || 0, playing: !video.paused };
      setManagedHls(false);
      setQuality("الأصلية");
      setStreamSource(originalSource);
    };
    void import("hls.js").then(({ default: Hls }) => {
      if (disposed) return;
      if (!Hls.isSupported()) { fallback(); return; }
      const engine = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 90, maxBufferLength: 45 });
      hlsEngineRef.current = engine;
      engine.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) fallback(); });
      engine.attachMedia(video);
      engine.on(Hls.Events.MEDIA_ATTACHED, () => engine.loadSource(streamSource));
    }).catch(fallback);
    return () => {
      disposed = true;
      hlsEngineRef.current?.destroy();
      hlsEngineRef.current = null;
    };
  }, [managedHls, originalSource, streamSource]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !seekRequest || !Number.isFinite(seekRequest.seconds)) return;
    const target = Math.max(0, Math.min(video.duration || seekRequest.seconds, seekRequest.seconds));
    video.currentTime = target;
    setTime(target);
    onTimeChange?.(target);
    void video.play().catch(() => undefined);
  }, [onTimeChange, seekRequest]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    setPlaybackMessage("");
    try { if (video.paused) await video.play(); else video.pause(); }
    catch { setPlaybackMessage("لم يبدأ التشغيل. اضغط تشغيل مجددًا، وتحقق من اتصالك إذا استمرت المشكلة."); }
  };
  const jump = (seconds: number) => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + seconds)); };
  const changeRate = (value: number) => { setRate(value); if (videoRef.current) videoRef.current.playbackRate = value; };
  const changeQuality = (value: string) => {
    const nextSource = qualitySources[value];
    if (!nextSource || nextSource === streamSource) { setQuality(value); return; }
    const video = videoRef.current;
    pendingPlaybackRef.current = { seconds: video?.currentTime || 0, playing: Boolean(video && !video.paused) };
    const nativeHls = Boolean(video?.canPlayType("application/vnd.apple.mpegurl"));
    setManagedHls(nextSource.includes("/hls/") && !nativeHls && typeof window.MediaSource !== "undefined");
    setQuality(value);
    setStreamSource(nextSource);
    setSettings(false);
  };
  const changeVolume = (value: number) => { setVolume(value); setMuted(value === 0); if (videoRef.current) { videoRef.current.volume = value; videoRef.current.muted = value === 0; } };
  const toggleMute = () => { const next = !muted; setMuted(next); if (videoRef.current) videoRef.current.muted = next; };
  const saveProgress = (watchedSeconds: number, completed = false) => {
    if (!courseSlug || !lessonId) return;
    void fetch("/api/progress", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseSlug, lessonId, watchedSeconds, completed }), keepalive: true }).catch(() => undefined);
  };
  const retry = () => {
    const video = videoRef.current;
    if (video && Number.isFinite(video.currentTime)) pendingPlaybackRef.current = { seconds: video.currentTime, playing: !video.paused };
    setHasError(false);
    setSessionError("");
    setStreamSource(source || "");
    if (source) videoRef.current?.load(); else setSessionAttempt((value) => value + 1);
  };

  return (
    <div ref={shellRef} className={`secure-player ${fullscreen ? "is-fullscreen" : ""} ${fallbackFullscreen ? "browser-fullscreen" : ""} ${rotated ? "video-rotated" : ""}`} onContextMenu={(event) => event.preventDefault()} onKeyDown={(event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || (event.target instanceof Element && event.target.closest("button,input,select,textarea,a,[contenteditable]"))) return;
      if (event.key === " ") { event.preventDefault(); void togglePlay(); }
      if (event.key === "ArrowRight") { event.preventDefault(); jump(-10); }
      if (event.key === "ArrowLeft") { event.preventDefault(); jump(10); }
      if (event.key.toLowerCase() === "m") toggleMute();
      if (event.key.toLowerCase() === "f") { event.preventDefault(); void fullScreen(); }
      if (event.key.toLowerCase() === "r" && fullscreen) toggleRotation();
    }} tabIndex={0} aria-label={`مشغل فيديو: ${title}`}>
      {fullscreen && <button type="button" className="video-exit-fullscreen" onClick={() => void closeFullscreen()} aria-label="تصغير الفيديو"><Minimize size={18} /><span>تصغير</span></button>}
      {(fullscreenMessage || playbackMessage) && <p className="video-action-message" role="status">{fullscreenMessage || playbackMessage}</p>}
      <div className="secure-player-stage">
      <video ref={videoRef} src={managedHls ? undefined : streamSource || undefined} poster={posterSource || undefined} playsInline preload="auto" disablePictureInPicture disableRemotePlayback controlsList="nodownload noremoteplayback nofullscreen" onPlay={() => { setPlaying(true); setPlaybackMessage(""); }} onPause={() => setPlaying(false)} onTimeUpdate={(event) => { const current = event.currentTarget.currentTime; setTime(current); onTimeChange?.(current); if (current - lastSavedRef.current >= 15) { lastSavedRef.current = current; saveProgress(Math.floor(current)); } }} onLoadedMetadata={(event) => { const pending = pendingPlaybackRef.current; if (pending) { event.currentTarget.currentTime = Math.min(event.currentTarget.duration || pending.seconds, pending.seconds); pendingPlaybackRef.current = null; if (pending.playing) void event.currentTarget.play().catch(() => undefined); } event.currentTarget.playbackRate = rate; setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0); setHasError(false); }} onCanPlay={() => setHasError(false)} onEnded={(event) => { setPlaying(false); saveProgress(Math.floor(event.currentTarget.duration), true); }} onError={() => { if (streamSource && !managedHls) setHasError(true); }} />
      <div className="secure-player-bg" />
      <div className={`video-watermark watermark-${watermark}`}>{preview ? "درس تجريبي مجاني" : studentLabel}</div>
      <div className="video-brand"><BrandLockup compact /></div>
      {sessionLoading && <div className="video-error"><LoaderCircle size={30} className="spin" /><strong>جارٍ تجهيز جلسة المشاهدة المحمية</strong><span>الرابط مؤقت ومرتبط بحسابك الحالي.</span></div>}
      {(hasError || sessionError) && !sessionLoading && <div className="video-error">{processing && ["queued", "processing"].includes(processing.status) ? <LoaderCircle size={30} className="spin" /> : <ShieldCheck size={30} />}<strong>{sessionError || "تعذّر تحميل الفيديو"}</strong><span>{processing && ["queued", "processing"].includes(processing.status) ? `${processing.message}${processing.progress ? ` · ${Math.max(1, Math.min(100, processing.progress))}%` : ""}` : sessionError || "تحقق من اتصالك ثم أعد المحاولة. يدعم المشغل طلبات النطاق اللازمة لمتصفحات الجوال."}</span><button type="button" className="video-retry" onClick={retry}><RefreshCw size={15} /> إعادة المحاولة</button></div>}
      {!hasError && !sessionError && !sessionLoading && processing && ["queued", "processing", "retrying"].includes(processing.status) && <div className="video-processing-note" role="status"><LoaderCircle size={14} className="spin" /> {processing.message}{processing.status === "processing" && processing.progress ? ` · ${Math.max(1, Math.min(100, processing.progress))}%` : ""}</div>}
      {privacyCovered && <div className="video-privacy-cover"><ShieldCheck size={36} /><strong>المحتوى محمي داخل مراس</strong></div>}
      {!playing && !hasError && !sessionError && !sessionLoading && streamSource && <button className="video-center-play" onClick={togglePlay} aria-label="تشغيل"><Play size={29} fill="currentColor" /></button>}
      <div className="video-title-overlay"><strong>{title}</strong><span>{preview ? "معاينة مجانية" : "جلسة مشاهدة محمية"}</span></div>
      <div className="video-controls">
        <input className="video-progress" type="range" min="0" max={duration || 1} step="0.1" value={time} onChange={(event) => { const value = Number(event.target.value); setTime(value); onTimeChange?.(value); if (videoRef.current) videoRef.current.currentTime = value; }} style={{ "--progress": `${duration ? (time / duration) * 100 : 0}%` } as React.CSSProperties} aria-label="التقدم في الفيديو" />
        <div className="video-controls-row">
          <div className="video-controls-main">
            <button onClick={togglePlay} aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
            <button onClick={() => jump(-10)} aria-label="الرجوع عشر ثوان"><RotateCcw size={18} /><small>10</small></button>
            <button onClick={() => jump(10)} aria-label="التقديم عشر ثوان"><RotateCw size={18} /><small>10</small></button>
            <button onClick={toggleMute} aria-label="كتم الصوت">{muted || volume === 0 ? <VolumeX size={19} /> : volume < .5 ? <Volume1 size={19} /> : <Volume2 size={19} />}</button>
            <input className="volume-slider" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={(event) => changeVolume(Number(event.target.value))} aria-label="مستوى الصوت" />
            <span className="video-time">{formatTime(time)} / {formatTime(duration)}</span>
          </div>
          <div className="video-controls-side">

            <button className="control-label" onClick={() => setSettings(!settings)}><Gauge size={17} /><span>{rate}×</span></button>
            <button className="control-label" onClick={() => setSettings(!settings)}><span>{quality}</span></button>
            <button onClick={() => setSettings(!settings)} aria-label="الإعدادات"><Settings size={19} /></button>
            {fullscreen && <button className={rotated ? "active" : ""} onClick={toggleRotation} aria-label="تدوير المشغل"><RotateCw size={19} /></button>}
            <button onClick={() => void fullScreen()} aria-label={fullscreen ? "إنهاء ملء الشاشة" : "ملء الشاشة"}>{fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}</button>
          </div>
        </div>
      </div>
      {settings && <div className="player-settings" role="region" aria-label="إعدادات المشاهدة"><div><Settings size={16} /><strong>إعدادات المشاهدة</strong><button type="button" aria-label="إغلاق إعدادات المشاهدة" onClick={() => setSettings(false)}>×</button></div><label>السرعة<span>{[.5,.75,1,1.25,1.5,2].map((value) => <button key={value} className={rate === value ? "active" : ""} onClick={() => changeRate(value)}>{rate === value && <Check size={11} />}{value}×</button>)}</span></label><label>الجودة<span>{Object.keys(qualitySources).map((value) => <button key={value} className={quality === value ? "active" : ""} onClick={() => changeQuality(value)}>{quality === value && <Check size={11} />}{value}</button>)}</span></label><p><ShieldCheck size={14} /> عند توفر البث المتكيف يختار المشغل أفضل جودة للاتصال تلقائيًا، مع بقاء الفيديو الأصلي خيارًا احتياطيًا.</p></div>}
      </div>
    </div>
  );
}
