"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Upload, X } from "lucide-react";
import styles from "./instructor-workspace.module.css";

export function InstructorCamera({ disabled, onUpload }: { disabled: boolean; onUpload: (file: File) => Promise<void> }) {
  const video = useRef<HTMLVideoElement>(null), streamRef = useRef<MediaStream | null>(null), generation = useRef(0), previewUrl = useRef("");
  const [stream, setStream] = useState<MediaStream | null>(null), [photo, setPhoto] = useState<File | null>(null), [preview, setPreview] = useState("");
  const [error, setError] = useState(""), [starting, setStarting] = useState(false), [ready, setReady] = useState(false);
  const stop = useCallback(() => { generation.current++; streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; setStream(null); setReady(false); setStarting(false); }, []);
  useEffect(() => { if (video.current && stream) video.current.srcObject = stream; }, [stream]);
  useEffect(() => {
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hide);
    // The mutable counter invalidates pending permission/capture promises, rather than pointing to a DOM node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { generation.current++; streamRef.current?.getTracks().forEach(track => track.stop()); document.removeEventListener("visibilitychange", hide); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); };
  }, [stop]);
  function clearPhoto() { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = ""; setPhoto(null); setPreview(""); }
  async function start() {
    if (disabled || starting) return;
    stop(); const request = ++generation.current; setError(""); clearPhoto(); setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("الكاميرا غير متاحة. افتح الموقع عبر اتصال آمن وعلى جهاز مزود بكاميرا.");
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } } });
      if (request !== generation.current) { next.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = next; setStream(next);
    } catch (reason) { if (request === generation.current) setError(reason instanceof Error && reason.name === "NotAllowedError" ? "اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح، ثم حاول مجددًا." : reason instanceof Error ? reason.message : "تعذر تشغيل الكاميرا"); }
    finally { if (request === generation.current) setStarting(false); }
  }
  async function capture() {
    const element = video.current; if (!element || !ready || !element.videoWidth || disabled) return;
    const canvas = document.createElement("canvas"), scale = Math.min(1, 1280 / element.videoWidth);
    canvas.width = Math.round(element.videoWidth * scale); canvas.height = Math.round(element.videoHeight * scale);
    const context = canvas.getContext("2d"); if (!context) { setError("تعذر التقاط الصورة. أعد المحاولة."); return; }
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    const request = generation.current;
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .9));
    if (request !== generation.current) return;
    if (!blob) { setError("تعذر حفظ الصورة"); return; }
    const file = new File([blob], "instructor-selfie.jpg", { type: "image/jpeg" });
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = URL.createObjectURL(file);
    setPhoto(file); setPreview(previewUrl.current); stop();
  }
  async function upload() { if (!photo || disabled) return; try { await onUpload(photo); clearPhoto(); } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر رفع الصورة"); } }
  return <div className={styles.camera}>
    <h3><Camera size={19} /> صورتك الشخصية</h3><p>التقط صورة واضحة لوجهك بإضاءة مناسبة. الصورة للمراجعة ضمن طلبك، ولا نُجري هنا مطابقة حيوية تلقائية.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {stream && <video ref={video} autoPlay muted playsInline onLoadedData={() => setReady(true)} aria-label="معاينة الكاميرا قبل التقاط الصورة" />}
    {/* Browser-created local camera preview cannot use the remote image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {preview && <img src={preview} alt="صورتك الملتقطة للمراجعة قبل الرفع" />}
    <div className={styles.actions}>{!stream && <button type="button" className="button button-soft" disabled={disabled || starting} onClick={() => void start()}>{photo ? <RotateCcw size={17} /> : <Camera size={17} />}{starting ? "جارٍ تشغيل الكاميرا…" : photo ? "إعادة الالتقاط" : "تشغيل الكاميرا"}</button>}{stream && <><button type="button" className="button button-primary" disabled={disabled || !ready} onClick={() => void capture()}>التقاط الصورة</button><button type="button" className="button button-ghost" onClick={stop}><X size={16} />إغلاق الكاميرا</button></>}{photo && <button type="button" className="button button-primary" disabled={disabled} onClick={() => void upload()}><Upload size={17} />اعتماد الصورة ورفعها</button>}</div>
  </div>;
}
