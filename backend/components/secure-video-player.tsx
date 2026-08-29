"use client";

/* eslint-disable @next/next/no-img-element -- the in-player watermark must not use the image proxy */

import { useEffect, useRef, useState } from "react";
import { Captions, Check, Gauge, LoaderCircle, Maximize, Pause, Play, RotateCcw, RotateCw, Settings, ShieldCheck, Volume1, Volume2, VolumeX } from "lucide-react";

type Props = { title: string; studentLabel?: string; preview?: boolean; source?: string; courseSlug?: string; lessonId?: string };

const formatTime = (value: number) => {
  if (!Number.isFinite(value)) return "00:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export function SecureVideoPlayer({ title, studentLabel = "طالب مراس", preview = false, source, courseSlug, lessonId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [quality, setQuality] = useState("تلقائي");
  const [captions, setCaptions] = useState(false);
  const [settings, setSettings] = useState(false);
  const [watermark, setWatermark] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [streamSource, setStreamSource] = useState(source || "");
  const [sessionLoading, setSessionLoading] = useState(Boolean(!source && courseSlug && lessonId));
  const [sessionError, setSessionError] = useState("");
  const lastSavedRef = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => setWatermark((value) => (value + 1) % 4), 9000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (source || !courseSlug || !lessonId) return;
    const controller = new AbortController();
    fetch("/api/video/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseSlug, lessonId }),
      signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json() as { streamUrl?: string; error?: string };
      if (!response.ok || !data.streamUrl) throw new Error(data.error || "تعذر إنشاء جلسة المشاهدة");
      setStreamSource(data.streamUrl);
      setSessionLoading(false);
    }).catch((caught) => {
      if ((caught as Error).name === "AbortError") return;
      setSessionError(caught instanceof Error ? caught.message : "تعذر إنشاء جلسة المشاهدة");
      setSessionLoading(false);
    });
    return () => controller.abort();
  }, [courseSlug, lessonId, source]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) await video.play(); else video.pause();
  };
  const jump = (seconds: number) => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + seconds)); };
  const changeRate = (value: number) => { setRate(value); if (videoRef.current) videoRef.current.playbackRate = value; };
  const changeVolume = (value: number) => { setVolume(value); setMuted(value === 0); if (videoRef.current) { videoRef.current.volume = value; videoRef.current.muted = value === 0; } };
  const toggleMute = () => { const next = !muted; setMuted(next); if (videoRef.current) videoRef.current.muted = next; };
  const fullScreen = () => { if (document.fullscreenElement) document.exitFullscreen(); else shellRef.current?.requestFullscreen(); };
  const saveProgress = (watchedSeconds: number, completed = false) => {
    if (!courseSlug || !lessonId) return;
    void fetch("/api/progress", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseSlug, lessonId, watchedSeconds, completed }), keepalive: true }).catch(() => undefined);
  };

  return (
    <div ref={shellRef} className="secure-player" onContextMenu={(event) => event.preventDefault()} onKeyDown={(event) => { if (event.key === " ") { event.preventDefault(); void togglePlay(); } if (event.key === "ArrowRight") jump(-10); if (event.key === "ArrowLeft") jump(10); if (event.key.toLowerCase() === "m") toggleMute(); if (event.key.toLowerCase() === "f") fullScreen(); }} tabIndex={0} aria-label={`مشغل فيديو: ${title}`}>
      <video ref={videoRef} src={streamSource || undefined} playsInline preload="metadata" disablePictureInPicture controlsList="nodownload noremoteplayback nofullscreen" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => { const current = event.currentTarget.currentTime; setTime(current); if (current - lastSavedRef.current >= 15) { lastSavedRef.current = current; saveProgress(Math.floor(current)); } }} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onEnded={(event) => { setPlaying(false); saveProgress(Math.floor(event.currentTarget.duration), true); }} onError={() => setHasError(true)} />
      <div className="secure-player-bg" />
      <div className={`video-watermark watermark-${watermark}`}>{preview ? "درس تجريبي مجاني" : studentLabel}</div>
      <div className="video-brand"><img src="/brand/logo-dark-hq.png" alt="" width={496} height={289} loading="lazy" decoding="async" /></div>
      {captions && playing && <div className="video-caption">لا يوجد ملف ترجمة مرفوع لهذا الدرس بعد.</div>}
      {sessionLoading && <div className="video-error"><LoaderCircle size={30} className="spin" /><strong>جارٍ تجهيز جلسة المشاهدة المحمية</strong><span>الرابط مؤقت ومرتبط بحسابك الحالي.</span></div>}
      {(hasError || sessionError) && !sessionLoading && <div className="video-error"><ShieldCheck size={30} /><strong>{sessionError || "تعذّر تحميل الفيديو"}</strong><span>تأكد من صلاحية المادة، أو أخبر الدعم إذا استمرت المشكلة.</span></div>}
      {!playing && !hasError && !sessionError && !sessionLoading && streamSource && <button className="video-center-play" onClick={togglePlay} aria-label="تشغيل"><Play size={29} fill="currentColor" /></button>}
      <div className="video-title-overlay"><strong>{title}</strong><span>{preview ? "معاينة مجانية" : "جلسة مشاهدة محمية"}</span></div>
      <div className="video-controls">
        <input className="video-progress" type="range" min="0" max={duration || 1} step="0.1" value={time} onChange={(event) => { const value = Number(event.target.value); setTime(value); if (videoRef.current) videoRef.current.currentTime = value; }} style={{ "--progress": `${duration ? (time / duration) * 100 : 0}%` } as React.CSSProperties} aria-label="التقدم في الفيديو" />
        <div className="video-controls-row">
          <div className="video-controls-main">
            <button onClick={togglePlay} aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
            <button onClick={() => jump(-10)} aria-label="الرجوع عشر ثوان"><RotateCcw size={18} /><small>10</small></button>
            <button onClick={() => jump(10)} aria-label="التقديم عشر ثوان"><RotateCw size={18} /><small>10</small></button>
            <button onClick={toggleMute} aria-label="كتم الصوت">{muted || volume === 0 ? <VolumeX size={19} /> : volume < .5 ? <Volume1 size={19} /> : <Volume2 size={19} />}</button>
            <input className="volume-slider" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={(e) => changeVolume(Number(e.target.value))} aria-label="مستوى الصوت" />
            <span className="video-time">{formatTime(time)} / {formatTime(duration)}</span>
          </div>
          <div className="video-controls-side">
            <button className={captions ? "active" : ""} onClick={() => setCaptions(!captions)} aria-label="الترجمة"><Captions size={19} /></button>
            <button className="control-label" onClick={() => setSettings(!settings)}><Gauge size={17} /><span>{rate}×</span></button>
            <button className="control-label" onClick={() => setSettings(!settings)}><span>{quality}</span></button>
            <button onClick={() => setSettings(!settings)} aria-label="الإعدادات"><Settings size={19} /></button>
            <button onClick={fullScreen} aria-label="ملء الشاشة"><Maximize size={19} /></button>
          </div>
        </div>
      </div>
      {settings && <div className="player-settings"><div><Settings size={16} /><strong>إعدادات المشاهدة</strong><button onClick={() => setSettings(false)}>×</button></div><label>السرعة<span>{[.5,.75,1,1.25,1.5,2].map((value) => <button key={value} className={rate === value ? "active" : ""} onClick={() => changeRate(value)}>{rate === value && <Check size={11} />}{value}×</button>)}</span></label><label>الجودة<span>{["تلقائي","1080p","720p","480p"].map((value) => <button key={value} className={quality === value ? "active" : ""} onClick={() => setQuality(value)}>{quality === value && <Check size={11} />}{value}</button>)}</span></label><p><ShieldCheck size={14} /> رابط المشاهدة مؤقت ومرتبط بجلسة الطالب</p></div>}
    </div>
  );
}
