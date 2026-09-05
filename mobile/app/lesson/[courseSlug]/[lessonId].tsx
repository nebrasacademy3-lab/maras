/* eslint-disable react-hooks/immutability, react-hooks/refs -- Expo Video and Animated expose imperative native objects by design. */
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useEvent } from "expo";
import * as ScreenCapture from "expo-screen-capture";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, BackHandler, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, LoadingState, Screen, useReduceMotion } from "@/src/components/ui";
import { absoluteUrl, api, ApiError, getApiToken, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import type { Catalog } from "@/src/types";
import { SafeAreaView } from "react-native-safe-area-context";
import { createCaptureLease, inlinePlayerHeight, playerBackAction, playerStageLayout } from "@/src/lib/player-layout";

const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
const qualities = ["تلقائي", "الأصلية"] as const;

type Origin = "learn" | "course";
type VideoNote = { id: number; lessonId: string; body: string; timestampSeconds: number; createdAt: string; updatedAt: string };
type PreparedPlayback = {
  key: string;
  courseSlug: string;
  lessonId: string;
  resumeAt: number;
  source: {
    uri: string;
    headers: Record<string, string>;
    contentType: "progressive" | "hls";
    useCaching: false;
    metadata: { title: string; artist: string };
  };
};

export default function LessonPlayer() {
  const { courseSlug, lessonId, from } = useLocalSearchParams<{ courseSlug: string; lessonId: string; from?: Origin }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { direction, rowDirection, startAlignment, t } = useLanguage();
  const window = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const [captureState, setCaptureState] = useState<"checking" | "ready" | "failed">(Platform.OS === "web" ? "ready" : "checking");
  const [captureRetry, setCaptureRetry] = useState(0);
  const captureReady = captureState === "ready";
  const origin: Origin = from === "course" ? "course" : "learn";

  const [course, setCourse] = useState<Catalog["courses"][number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [privateOverlay, setPrivateOverlay] = useState(false);
  const [note, setNote] = useState("");
  const [videoNotes, setVideoNotes] = useState<VideoNote[]>([]);
  const [noteMessage, setNoteMessage] = useState("");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [quality, setQuality] = useState<(typeof qualities)[number]>("تلقائي");
  const [retryKey, setRetryKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [manualRotation, setManualRotation] = useState(false);
  const [preparedPlayback, setPreparedPlayback] = useState<PreparedPlayback | null>(null);
  const videoRef = useRef<VideoView>(null);
  const seeking = useRef(false);
  const watermark = useRef(new Animated.Value(0)).current;

  const player = useVideoPlayer(null, (instance) => {
    instance.loop = false;
    instance.muted = false;
    instance.volume = 1;
    instance.playbackRate = 1;
    instance.audioMixingMode = "doNotMix";
    instance.timeUpdateEventInterval = 0.5;
  });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const statusEvent = useEvent(player, "statusChange", { status: player.status });
  const playbackError = statusEvent.status === "error"
    ? (("error" in statusEvent && statusEvent.error?.message) || "تعذر تشغيل ملف الفيديو. أعد المحاولة أو تواصل مع الدعم إذا استمرت المشكلة.")
    : "";

  const lessons = useMemo(() => course?.units.flatMap((unit) => unit.lessons) || [], [course]);
  const lesson = useMemo(() => lessons.find((item) => item.id === lessonId), [lessons, lessonId]);
  const navigableLessons = useMemo(
    () => lessons.filter((item) => item.ready && (origin === "learn" || item.free)),
    [lessons, origin],
  );
  const lessonIndex = navigableLessons.findIndex((item) => item.id === lessonId);
  const previousLesson = lessonIndex > 0 ? navigableLessons[lessonIndex - 1] : null;
  const nextLesson = lessonIndex >= 0 && lessonIndex < navigableLessons.length - 1 ? navigableLessons[lessonIndex + 1] : null;

  const returnHref = useMemo(() => origin === "course"
    ? ({ pathname: "/course/[slug]", params: { slug: courseSlug || "" } } as const)
    : ({ pathname: "/learn/[slug]", params: { slug: courseSlug || "" } } as const), [courseSlug, origin]);

  const releaseVideo = useCallback(() => {
    try { player.pause(); void player.replaceAsync(null).catch(() => undefined); } catch { /* Player may already be released. */ }
  }, [player]);

  const leavePlayer = useCallback(() => {
    setFullscreen(false);
    releaseVideo();
    router.dismissTo(returnHref as never);
  }, [releaseVideo, returnHref]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const action = playerBackAction(fullscreen, settingsOpen);
      if (action === "close-settings") { setSettingsOpen(false); return true; }
      if (action === "exit-fullscreen") {
        setFullscreen(false);
        setManualRotation(false);
        return true;
      }
      leavePlayer();
      return true;
    });
    return () => subscription.remove();
  }, [fullscreen, settingsOpen, leavePlayer]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setPrivateOverlay(state !== "active");
      if (state !== "active") { try { player.pause(); } catch { /* Released while leaving the screen. */ } }
    });
    return () => {
      subscription.remove();
      releaseVideo();
    };
  }, [player, releaseVideo]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = true;
    const lease = createCaptureLease({ prevent: ScreenCapture.preventScreenCaptureAsync, allow: ScreenCapture.allowScreenCaptureAsync });
    void lease.ready.then(() => { if (active) setCaptureState("ready"); }).catch(() => {
      if (!active) return;
      setCaptureState("failed");
      try { player.pause(); } catch { /* Already released. */ }
    });
    return () => { active = false; void lease.release().catch(() => undefined); };
  }, [captureRetry, player]);

  useEffect(() => {
    if (reduceMotion) { watermark.setValue(0.5); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(watermark, { toValue: 1, duration: 9000, useNativeDriver: true }),
      Animated.timing(watermark, { toValue: 0, duration: 9000, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [watermark, reduceMotion]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!seeking.current) setTime(player.currentTime || 0);
      setDuration(player.duration || 0);
    }, 400);
    return () => clearInterval(timer);
  }, [player]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try { player.pause(); } catch { /* The previous source may not be mounted yet. */ }
      setLoading(true);
      setError("");
      setCourse(null);
      setPreparedPlayback(null);
      setVideoNotes([]);
      setNote("");
      setTime(0);
      setDuration(0);
      setSettingsOpen(false);
      setNoteMessage("");
      try {
        const catalog = await api<Catalog>("/api/mobile/catalog");
        const selected = catalog.courses.find((item) => item.slug === courseSlug);
        if (!selected) throw new Error("المادة غير موجودة");
        const selectedLesson = selected.units.flatMap((unit) => unit.lessons).find((item) => item.id === lessonId);
        if (!selectedLesson) throw new Error("الدرس غير موجود");
        if (cancelled) return;
        const [session, progress, noteResult] = await Promise.all([
          api<{ streamUrl: string; expiresAt: string; adaptive?: boolean }>("/api/video/session", {
            method: "POST",
            body: jsonBody({ courseSlug, lessonId }),
          }),
          api<{ progress: { lessonId: string; watchedSeconds: number }[] }>(
            `/api/progress?course=${encodeURIComponent(courseSlug || "")}`,
          ).catch(() => ({ progress: [] })),
          api<{ notes: VideoNote[] }>(
            `/api/mobile/notes?lesson=${encodeURIComponent(lessonId || "")}`,
          ).catch(() => ({ notes: [] })),
        ]);
        if (cancelled) return;

        const token = getApiToken();
        const headers: Record<string, string> = { Accept: "video/*" };
        if (token) headers.Authorization = `Bearer ${token}`;

        const saved = progress.progress.find((item) => item.lessonId === lessonId);
        const resumeAt = saved?.watchedSeconds && Number.isFinite(saved.watchedSeconds) ? Math.max(0, saved.watchedSeconds) : 0;
        setCourse(selected);
        setVideoNotes(noteResult.notes || []);
        setPreparedPlayback({
          key: `${courseSlug}:${lessonId}:${retryKey}`,
          courseSlug: courseSlug || "",
          lessonId: lessonId || "",
          resumeAt,
          source: {
            uri: absoluteUrl(session.streamUrl),
            headers,
            contentType: session.adaptive ? "hls" : "progressive",
            useCaching: false,
            metadata: { title: selectedLesson.title, artist: "مراس العلم" },
          },
        });
      } catch (reason) {
        if (!cancelled) setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "تعذر تشغيل الدرس");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [courseSlug, lessonId, player, retryKey]);

  useEffect(() => {
    if (loading || !preparedPlayback || !captureReady) return;
    let cancelled = false;
    let applied = false;
    let acceptingStatus = false;
    let statusSubscription: { remove: () => void } | null = null;
    const applyResumeAndPlay = () => {
      if (cancelled || applied) return;
      applied = true;
      statusSubscription?.remove();
      statusSubscription = null;
      if (preparedPlayback.resumeAt > 0) {
        player.currentTime = preparedPlayback.resumeAt;
        setTime(preparedPlayback.resumeAt);
      }
      // Native playback can start immediately; browsers retain their visible play control when autoplay is blocked.
      if (Platform.OS !== "web" && AppState.currentState === "active") player.play();
    };
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      statusSubscription = player.addListener("statusChange", (event) => {
        if (!acceptingStatus) return;
        if (event.status === "readyToPlay") applyResumeAndPlay();
        else if (event.status === "error") {
          statusSubscription?.remove();
          statusSubscription = null;
        }
      });
      acceptingStatus = true;
      const replacement = player.replaceAsync(preparedPlayback.source);
      void replacement.then(() => {
        if (player.status === "readyToPlay") applyResumeAndPlay();
      }).catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "تعذر تشغيل الدرس");
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      statusSubscription?.remove();
    };
  }, [loading, player, preparedPlayback, captureReady]);

  useEffect(() => {
    if (!user || !courseSlug || !lessonId || loading || preparedPlayback?.courseSlug !== courseSlug || preparedPlayback.lessonId !== lessonId) return;
    const save = () => api("/api/progress", {
      method: "POST",
      body: jsonBody({
        courseSlug,
        lessonId,
        watchedSeconds: Math.floor(player.currentTime || 0),
        completed: player.duration > 0 && player.currentTime / player.duration >= 0.9,
      }),
    }).catch(() => undefined);
    const timer = setInterval(save, 15_000);
    return () => { clearInterval(timer); void save(); };
  }, [courseSlug, lessonId, loading, player, preparedPlayback, user]);

  const seek = (seconds: number) => {
    player.currentTime = Math.max(0, Math.min(player.duration || 0, player.currentTime + seconds));
  };

  const changeRate = (value: number) => {
    setRate(value);
    player.playbackRate = value;
  };

  const changeVolume = (value: number) => {
    const safe = Math.max(0, Math.min(1, value));
    setVolume(safe);
    setMuted(safe === 0);
    player.volume = safe;
    player.muted = safe === 0;
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    player.muted = next;
    if (!next && volume === 0) changeVolume(0.8);
  };

  const saveNote = async () => {
    setNoteMessage("");
    const body = note.trim();
    if (!body) { setNoteMessage("اكتب الملاحظة أولًا"); return; }
    try {
      const result = await api<{ note: VideoNote }>("/api/mobile/notes", { method: "POST", body: jsonBody({ lessonId, body, timestampSeconds: Math.floor(player.currentTime || 0) }) });
      setVideoNotes((current) => [...current, result.note].sort((left, right) => left.timestampSeconds - right.timestampSeconds || left.id - right.id));
      setNote("");
      setNoteMessage(`تم حفظ الملاحظة عند ${formatTime(result.note.timestampSeconds)}`);
    } catch (reason) {
      setNoteMessage(reason instanceof ApiError ? reason.message : "تعذر حفظ الملاحظة");
    }
  };

  const openNote = (item: VideoNote) => {
    if (!captureReady) return;
    player.currentTime = item.timestampSeconds;
    setTime(item.timestampSeconds);
    player.play();
  };

  const deleteNote = async (item: VideoNote) => {
    setNoteMessage("");
    try {
      await api("/api/mobile/notes", { method: "DELETE", body: jsonBody({ id: item.id }) });
      setVideoNotes((current) => current.filter((noteItem) => noteItem.id !== item.id));
      setNoteMessage("تم حذف الملاحظة");
    } catch (reason) {
      setNoteMessage(reason instanceof ApiError ? reason.message : "تعذر حذف الملاحظة");
    }
  };

  const openLesson = (targetLessonId: string) => {
    player.pause();
    router.replace({
      pathname: "/lesson/[courseSlug]/[lessonId]",
      params: { courseSlug: courseSlug || "", lessonId: targetLessonId, from: origin },
    });
  };

  if (loading) {
    return <Screen scroll={false} showFooter={false}><LoadingState label="جارٍ تجهيز المشغل المحمي..." /></Screen>;
  }

  if (error || !course || !lesson) {
    return (
      <Screen showFooter={false}>
        <AppHeader title="مشغل مراس" back onBack={leavePlayer} />
        <Card style={styles.errorCard}>
          <Ionicons name="shield-outline" size={38} color={colors.danger} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>تعذر فتح الدرس</Text>
          <Text style={[styles.errorText, { color: colors.textSoft }]}>{error || "الدرس غير موجود"}</Text>
          <AppButton title="العودة للمادة" onPress={leavePlayer} />
        </Card>
      </Screen>
    );
  }

  const showPlayerLoading = statusEvent.status === "loading" && !playbackError;

  return (
    <LessonSurface fullscreen={fullscreen} background={colors.background}>
      <View style={[styles.headerPad, fullscreen && Platform.OS !== "web" && styles.hidden]}>
        <AppHeader title={lesson.title} subtitle={course.title} back onBack={leavePlayer} />
      </View>

      <PlayerFullscreenHost expanded={fullscreen} rotated={manualRotation} width={window.width} height={window.height} onClose={() => { setFullscreen(false); setManualRotation(false); }}>
      <View style={[styles.playerWrap, (fullscreen || Platform.OS !== "web") && styles.playerWrapFullscreen]}>
        <VideoView
          ref={videoRef}
          player={player}
          style={styles.video}
          nativeControls={false}
          contentFit="contain"
          allowsPictureInPicture={false}
          allowsVideoFrameAnalysis={false}
          fullscreenOptions={{ enable: false }}
          {...(Platform.OS === "android" ? { surfaceType: "textureView" as const } : {})}
        />

        <View pointerEvents="none" style={styles.topShade} />
        <View pointerEvents="none" style={styles.bottomShade} />
        <View pointerEvents="none" style={styles.titleOverlay}>
          <Text numberOfLines={1} style={styles.overlayTitle}>{lesson.title}</Text>
          <Text style={styles.overlaySub}>جلسة مشاهدة محمية</Text>
        </View>

        <Animated.View
          pointerEvents="none"
          style={[styles.watermark, {
            transform: [
              { translateX: watermark.interpolate({ inputRange: [0, 1], outputRange: [-70, 70] }) },
              { translateY: watermark.interpolate({ inputRange: [0, 1], outputRange: [-50, 55] }) },
              { rotate: "-15deg" },
            ],
          }]}
        >
          <Text style={styles.watermarkText}>{user?.fullName || "طالب مراس"}</Text>
          <Text style={styles.watermarkMeta}>{user?.phone || user?.email || "معاينة"}</Text>
        </Animated.View>

        {captions && isPlaying ? <View pointerEvents="none" style={styles.caption}><Text style={styles.captionText}>لا يوجد ملف ترجمة مرفوع لهذا الدرس بعد.</Text></View> : null}

        {showPlayerLoading ? <View pointerEvents="none" style={styles.playerState}><Ionicons name="hourglass-outline" size={30} color="#FFFFFF" /><Text style={styles.playerStateTitle}>جارٍ تحميل الفيديو...</Text></View> : null}
        {playbackError ? <View style={styles.playerState}><Ionicons name="alert-circle-outline" size={32} color="#FFFFFF" /><Text style={styles.playerStateTitle}>تعذّر تشغيل الفيديو</Text><Text style={styles.playerStateText}>{playbackError}</Text><Pressable style={styles.retryButton} onPress={() => setRetryKey((value) => value + 1)}><Ionicons name="refresh" size={16} color="#FFFFFF" /><Text style={styles.retryText}>إعادة المحاولة</Text></Pressable></View> : null}

        {!isPlaying && !playbackError && statusEvent.status === "readyToPlay" ? (
          <Pressable accessibilityLabel={t("تشغيل")} disabled={!captureReady} onPress={() => player.play()} style={styles.centerPlay}>
            <Ionicons name="play" size={31} color="#FFFFFF" />
          </Pressable>
        ) : null}

        {privateOverlay ? <View style={styles.privacy}><Ionicons name="shield-checkmark" size={40} color="#FFFFFF" /><Text style={styles.privacyText}>المحتوى محمي داخل مراس</Text></View> : null}

        {!captureReady ? <View style={[styles.playerState, styles.captureBlock]}>
          <Text style={styles.playerStateTitle}>{captureState === "failed" ? "تعذر تفعيل حماية المشاهدة" : "جارٍ تأمين المشاهدة..."}</Text>
          <Text style={styles.playerStateText}>{captureState === "failed" ? "لم نبدأ تشغيل الفيديو. أعد المحاولة لتفعيل الحماية على جهازك." : "يبدأ تشغيل الفيديو بعد تفعيل الحماية."}</Text>
          {captureState === "failed" ? <View style={styles.captureActions}>
            <Pressable accessibilityRole="button" style={styles.retryButton} onPress={() => { setCaptureState("checking"); setCaptureRetry((value) => value + 1); }}><Text style={styles.retryText}>إعادة تفعيل الحماية</Text></Pressable>
            <Pressable accessibilityRole="button" style={styles.retryButton} onPress={leavePlayer}><Text style={styles.retryText}>العودة للمادة</Text></Pressable>
          </View> : null}
        </View> : null}

        <View style={styles.controls}>
          <Slider
            accessibilityLabel={t("موضع التشغيل")}
            style={styles.slider}
            minimumValue={0}
            maximumValue={Math.max(duration, 1)}
            value={Math.min(time, Math.max(duration, 1))}
            onValueChange={setTime}
            onSlidingStart={() => { seeking.current = true; }}
            onSlidingComplete={(value) => { player.currentTime = value; setTime(value); seeking.current = false; }}
            minimumTrackTintColor="#4D82FF"
            maximumTrackTintColor="rgba(255,255,255,.25)"
            thumbTintColor="#FFFFFF"
          />
          <View style={[styles.controlsRow, { flexDirection: rowDirection }]}>
            <View style={[styles.controlsMain, { flexDirection: rowDirection }]}>
              <PlayerButton icon={isPlaying ? "pause" : "play"} onPress={() => isPlaying ? player.pause() : captureReady ? player.play() : undefined} />
              <PlayerButton icon="play-back" label="10" onPress={() => seek(-10)} />
              <PlayerButton icon="play-forward" label="10" onPress={() => seek(10)} />
              <PlayerButton icon={muted ? "volume-mute" : "volume-high"} onPress={toggleMute} />
              <Text style={styles.timeText}>{formatTime(time)} / {formatTime(duration)}</Text>
            </View>
            <View style={[styles.controlsSide, { flexDirection: rowDirection }]}>
              <PlayerButton icon="text" active={captions} onPress={() => setCaptions((value) => !value)} />
              <Pressable style={styles.labelButton} onPress={() => setSettingsOpen((value) => !value)}><Text style={styles.labelButtonText}>{rate}×</Text></Pressable>
              <PlayerButton icon="settings-outline" active={settingsOpen} onPress={() => setSettingsOpen((value) => !value)} />
              {fullscreen ? <PlayerButton icon="phone-landscape-outline" active={manualRotation} onPress={() => setManualRotation((value) => !value)} /> : null}
              <PlayerButton icon={fullscreen ? "contract-outline" : "expand-outline"} onPress={() => { setFullscreen((value) => !value); setManualRotation(false); }} />
            </View>
          </View>
        </View>

        {settingsOpen ? (
          <View style={[styles.settings, { direction }]}>
            <View style={[styles.settingsHead, { flexDirection: rowDirection }]}><Ionicons name="settings-outline" size={16} color="#FFFFFF" /><Text style={styles.settingsTitle}>إعدادات المشاهدة</Text><PlayerButton icon={fullscreen ? "contract-outline" : "expand-outline"} onPress={() => { setFullscreen((value) => !value); setManualRotation(false); }} /><Pressable accessibilityRole="button" accessibilityLabel={t("إغلاق الإعدادات")} hitSlop={10} onPress={() => setSettingsOpen(false)}><Ionicons name="close" size={22} color="#FFFFFF" /></Pressable></View>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.settingsScroll} contentContainerStyle={styles.settingsContent}>
            <Text style={styles.settingsLabel}>السرعة</Text>
            <View style={[styles.chips, { flexDirection: rowDirection, justifyContent: startAlignment }]}>{rates.map((value) => <Pressable key={value} onPress={() => changeRate(value)} style={[styles.chip, rate === value && styles.chipActive]}><Text style={styles.chipText}>{value}×</Text></Pressable>)}</View>
            <Text style={styles.settingsLabel}>الجودة</Text>
            <View style={[styles.chips, { flexDirection: rowDirection, justifyContent: startAlignment }]}>{qualities.map((value) => <Pressable key={value} onPress={() => setQuality(value)} style={[styles.chip, quality === value && styles.chipActive]}><Text style={styles.chipText}>{value}</Text></Pressable>)}</View>
            <Text style={styles.settingsHelp}>يُعرض الفيديو بالحجم الأصلي داخل الإطار بدون قص أو تقريب.</Text>
            <Text style={styles.settingsLabel}>الصوت</Text>
            <Slider style={styles.volumeSlider} minimumValue={0} maximumValue={1} step={0.05} value={muted ? 0 : volume} onValueChange={changeVolume} minimumTrackTintColor="#4D82FF" maximumTrackTintColor="rgba(255,255,255,.25)" thumbTintColor="#FFFFFF" />
            </ScrollView>
          </View>
        ) : null}
      </View>
      </PlayerFullscreenHost>

      <LessonDetails fullscreen={fullscreen}><View style={styles.content}>
        <View style={[styles.navigationRow, { flexDirection: rowDirection }]}>
          <AppButton full={false} title="السابق" variant="soft" icon="chevron-forward" disabled={!previousLesson} onPress={() => previousLesson && openLesson(previousLesson.id)} />
          <AppButton full={false} title="التالي" variant="soft" icon="chevron-back" disabled={!nextLesson} onPress={() => nextLesson && openLesson(nextLesson.id)} />
        </View>
        <Text style={[styles.lessonTitle, { color: colors.text }]}>{lesson.title}</Text>
        <Text style={[styles.protection, { color: colors.textSoft }]}><Ionicons name="shield-checkmark-outline" size={14} color={colors.success} /> بث محمي · عرض كامل بدون قص · حفظ تقدم تلقائي</Text>
        <Card style={styles.notes}>
          <Text style={[styles.notesTitle, { color: colors.text }]}>ملاحظات مرتبطة بالفيديو</Text>
          <Text style={[styles.noteTimeHint, { color: colors.primary }]}>اللحظة الحالية: {formatTime(time)}</Text>
          <TextInput multiline value={note} onChangeText={setNote} placeholder="اكتب ملاحظتك عند هذه اللحظة..." placeholderTextColor={colors.textSoft} style={[styles.noteInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
          <AppButton title="حفظ عند هذه اللحظة" variant="soft" icon="bookmark-outline" onPress={saveNote} />
          {noteMessage ? <Text style={[styles.noteMessage, { color: noteMessage.startsWith("تم") ? colors.success : colors.danger }]}>{noteMessage}</Text> : null}
          <View style={styles.savedNotes}>{videoNotes.map((item) => <View key={item.id} style={[styles.savedNote, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, flexDirection: rowDirection }]}><Pressable style={[styles.savedNoteOpen, { flexDirection: rowDirection }]} onPress={() => openNote(item)}><Text style={styles.savedNoteTime}>{formatTime(item.timestampSeconds)}</Text><Text numberOfLines={2} style={[styles.savedNoteBody, { color: colors.text }]}>{item.body}</Text></Pressable><Pressable accessibilityLabel={t("حذف الملاحظة")} style={styles.savedNoteDelete} onPress={() => void deleteNote(item)}><Ionicons name="trash-outline" size={17} color={colors.danger} /></Pressable></View>)}{videoNotes.length === 0 ? <Text style={[styles.notesEmpty, { color: colors.textSoft }]}>أوقف الفيديو عند الموضع المطلوب واحفظ أول ملاحظة؛ ستظهر هنا ويمكنك الضغط عليها للعودة لنفس الثانية.</Text> : null}</View>
        </Card>
      </View></LessonDetails>
    </LessonSurface>
  );
}

function LessonSurface({ fullscreen, background, children }: { fullscreen: boolean; background: string; children: React.ReactNode }) {
  if (Platform.OS === "web") return <Screen padded={false} showFooter={false}>{children}</Screen>;
  // Fullscreen stays in the Activity protected by FLAG_SECURE, not a separate Modal window.
  return <SafeAreaView edges={["top", "bottom", "left", "right"]} style={[styles.nativeSurface, { backgroundColor: fullscreen ? "#000000" : background }]}><StatusBar hidden={fullscreen} />{children}</SafeAreaView>;
}

function LessonDetails({ fullscreen, children }: { fullscreen: boolean; children: React.ReactNode }) {
  if (Platform.OS === "web") return <>{children}</>;
  return <ScrollView keyboardShouldPersistTaps="handled" style={[styles.nativeDetails, fullscreen && styles.hidden]} contentContainerStyle={styles.nativeDetailsContent}>{children}</ScrollView>;
}

function PlayerFullscreenHost({ expanded, rotated, width, height, onClose, children }: { expanded: boolean; rotated: boolean; width: number; height: number; onClose: () => void; children: React.ReactNode }) {
  const [bounds, setBounds] = useState({ width, height: width * 9 / 16 });
  const stage = playerStageLayout(Platform.OS === "web" ? width : bounds.width, Platform.OS === "web" ? height : bounds.height, expanded && rotated);
  if (Platform.OS === "web") {
    return <WebPlayerHost expanded={expanded} width={width} height={height} onClose={onClose}><View style={expanded ? [styles.fullscreenStage, stage] : styles.webPlayerStage}>{children}</View></WebPlayerHost>;
  }
  // One stable host and one VideoView: changing size never detaches the native video surface.
  return <View onAccessibilityEscape={onClose} onLayout={(event) => { const next = event.nativeEvent.layout; setBounds((current) => current.width === next.width && current.height === next.height ? current : { width: next.width, height: next.height }); }} style={[styles.nativePlayerHost, expanded ? styles.nativePlayerExpanded : [styles.nativePlayerInline, { height: inlinePlayerHeight(width, height) }]]}><View style={[styles.fullscreenStage, stage]}>{children}</View></View>;
}

function openWebPlayerDialog(dialog: HTMLDialogElement) {
  if (typeof dialog.showModal !== "function") return false;
  try {
    if (dialog.open) dialog.close();
    dialog.showModal();
    return true;
  } catch {
    dialog.setAttribute("open", "");
    return false;
  }
}

function WebPlayerHost({ expanded, width, height, onClose, children }: { expanded: boolean; width: number; height: number; onClose: () => void; children: React.ReactNode }) {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!expanded || !dialog) return;
    // showModal promotes this same DOM node above Screen's animated transform.
    // No portal/reparenting: playback, settings and the VideoView remain mounted.
    if (!openWebPlayerDialog(dialog)) { closeHandler.current(); return; }
    const scrollRoots = [document.documentElement, document.body];
    const previous = scrollRoots.map((node) => ({ node, value: node.style.getPropertyValue("overflow"), priority: node.style.getPropertyPriority("overflow") }));
    for (const node of scrollRoots) node.style.setProperty("overflow", "hidden");
    return () => {
      if (dialog.open) dialog.close();
      if (dialog.isConnected) dialog.setAttribute("open", "");
      for (const { node, value, priority } of previous) {
        if (value) node.style.setProperty("overflow", value, priority);
        else node.style.removeProperty("overflow");
      }
    };
  }, [expanded]);
  return <dialog ref={dialogRef} open role={expanded ? "dialog" : "region"} aria-label={t("مشغل الدرس")} aria-modal={expanded || undefined} onCancel={(event) => { event.preventDefault(); onClose(); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", position: expanded ? "fixed" : "relative", inset: expanded ? 0 : undefined, width: expanded ? width : "100%", height: expanded ? height : "auto", maxWidth: "none", maxHeight: "none", margin: 0, padding: 0, border: 0, background: "#000000", overflow: "hidden" }}>{children}</dialog>;
}

function PlayerButton({ icon, label, active = false, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label?: string; active?: boolean; onPress: () => void }) {
  const { t } = useLanguage();
  const descriptions: Record<string, string> = { play: "تشغيل الفيديو", pause: "إيقاف الفيديو مؤقتًا", "play-back": "الرجوع عشر ثوانٍ", "play-forward": "التقدم عشر ثوانٍ", "volume-mute": "تشغيل الصوت", "volume-high": "كتم الصوت", text: "الترجمة", "settings-outline": "إعدادات المشاهدة", "phone-landscape-outline": "تدوير الفيديو", "contract-outline": "تصغير الفيديو", "expand-outline": "تكبير الفيديو" };
  return <Pressable accessibilityRole="button" accessibilityLabel={t(descriptions[icon] || label || "التحكم بالفيديو")} accessibilityState={{ selected: active }} onPress={onPress} style={[styles.playerButton, active && styles.playerButtonActive]}><Ionicons name={icon} size={18} color="#FFFFFF" />{label ? <Text style={styles.playerButtonLabel}>{label}</Text> : null}</Pressable>;
}

function formatTime(value: number) {
  const total = Math.max(0, Math.floor(value || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  nativeSurface: { flex: 1 },
  nativeDetails: { flex: 1 },
  nativeDetailsContent: { paddingBottom: 20 },
  hidden: { display: "none" },
  nativePlayerHost: { backgroundColor: "#000000", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  nativePlayerExpanded: { flex: 1, width: "100%" },
  nativePlayerInline: { width: "100%" },
  headerPad: { paddingHorizontal: 18 },
  playerWrap: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000000", position: "relative", overflow: "hidden" },
  playerWrapFullscreen: { width: "100%", height: "100%", aspectRatio: undefined },
  webPlayerStage: { width: "100%" },
  fullscreenStage: { backgroundColor: "#000000", alignItems: "stretch", justifyContent: "center" },
  video: { width: "100%", height: "100%", backgroundColor: "#000000" },
  topShade: { position: "absolute", top: 0, left: 0, right: 0, height: 72, backgroundColor: "rgba(0,0,0,.18)" },
  bottomShade: { position: "absolute", bottom: 0, left: 0, right: 0, height: 92, backgroundColor: "rgba(0,0,0,.48)" },
  titleOverlay: { position: "absolute", top: 11, left: 13, right: 13, alignItems: "flex-start" },
  overlayTitle: { maxWidth: "76%", color: "#FFFFFF", fontSize: 11, fontWeight: "900", writingDirection: "rtl" },
  overlaySub: { color: "rgba(255,255,255,.62)", fontSize: 8, marginTop: 3 },
  watermark: { position: "absolute", alignSelf: "center", top: "38%", opacity: 0.28, alignItems: "center" },
  watermarkText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  watermarkMeta: { color: "#FFFFFF", fontSize: 8, marginTop: 2 },
  caption: { position: "absolute", left: "12%", right: "12%", bottom: 73, alignItems: "center" },
  captionText: { color: "#FFFFFF", backgroundColor: "rgba(0,0,0,.78)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, textAlign: "center", fontSize: 10 },
  centerPlay: { position: "absolute", top: "50%", left: "50%", width: 64, height: 64, marginLeft: -32, marginTop: -32, borderRadius: 32, backgroundColor: "rgba(8,20,48,.70)", borderWidth: 1, borderColor: "rgba(255,255,255,.22)", alignItems: "center", justifyContent: "center", paddingLeft: 3 },
  controls: { position: "absolute", left: 9, right: 9, bottom: 7 },
  slider: { width: "100%", height: 24 },
  controlsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", rowGap: 2 },
  controlsMain: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 2 },
  controlsSide: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 2 },
  playerButton: { minWidth: 36, height: 36, borderRadius: 8, paddingHorizontal: 5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 1 },
  playerButtonActive: { backgroundColor: "rgba(255,255,255,.14)" },
  playerButtonLabel: { color: "#FFFFFF", fontSize: 6, marginLeft: -4, marginTop: -1 },
  labelButton: { minWidth: 38, height: 31, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  labelButtonText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  timeText: { color: "rgba(255,255,255,.74)", fontSize: 8, marginStart: 4, writingDirection: "ltr" },
  settings: { position: "absolute", zIndex: 40, start: 8, top: 8, bottom: 8, width: 310, maxWidth: "94%", padding: 10, borderWidth: 1, borderColor: "rgba(255,255,255,.16)", borderRadius: 14, backgroundColor: "rgba(5,12,31,.98)" },
  settingsScroll: { flex: 1 },
  settingsContent: { paddingBottom: 10 },
  settingsHead: { flexDirection: "row", alignItems: "center", gap: 7, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,.12)" },
  settingsTitle: { flex: 1, color: "#FFFFFF", fontSize: 11, fontWeight: "900", textAlign: "right" },
  settingsLabel: { color: "#9FB0CF", fontSize: 9, marginTop: 10, marginBottom: 6, textAlign: "right" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 5, justifyContent: "flex-end" },
  chip: { minHeight: 29, minWidth: 46, paddingHorizontal: 8, borderRadius: 7, borderWidth: 1, borderColor: "rgba(255,255,255,.10)", backgroundColor: "rgba(255,255,255,.05)", alignItems: "center", justifyContent: "center" },
  chipActive: { borderColor: "#4D82FF", backgroundColor: "#275AC8" },
  chipText: { color: "#FFFFFF", fontSize: 8, fontWeight: "800" },
  settingsHelp: { color: "#7890B5", fontSize: 8, lineHeight: 14, textAlign: "right", marginTop: 7 },
  volumeSlider: { width: "100%", height: 26 },
  playerState: { position: "absolute", zIndex: 20, top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(3,11,29,.94)", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 26 },
  playerStateTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "900", textAlign: "center" },
  playerStateText: { color: "#AAB9D4", fontSize: 9, lineHeight: 16, textAlign: "center" },
  retryButton: { marginTop: 7, minHeight: 36, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#275AC8", flexDirection: "row", alignItems: "center", gap: 6 },
  retryText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  captureBlock: { zIndex: 60 },
  captureActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  privacy: { position: "absolute", zIndex: 90, top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#02050B", alignItems: "center", justifyContent: "center", gap: 10 },
  privacyText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  content: { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 30 },
  navigationRow: { flexDirection: "row", gap: 8, justifyContent: "space-between", marginBottom: 15 },
  lessonTitle: { fontSize: 21, lineHeight: 31, fontWeight: "900", textAlign: "right" },
  protection: { fontSize: 9, textAlign: "right", marginTop: 7 },
  notes: { marginTop: 20 },
  notesTitle: { fontSize: 14, fontWeight: "900", textAlign: "right", marginBottom: 11 },
  noteTimeHint: { fontSize: 9, fontWeight: "900", textAlign: "right", marginBottom: 8, writingDirection: "rtl" },
  noteInput: { minHeight: 140, borderWidth: 1, borderRadius: 15, padding: 12, textAlignVertical: "top", writingDirection: "rtl", marginBottom: 10 },
  noteMessage: { fontSize: 9, textAlign: "center", marginTop: 8 },
  savedNotes: { gap: 8, marginTop: 14 },
  savedNote: { minHeight: 56, borderWidth: 1, borderRadius: 13, alignItems: "center", padding: 7, gap: 7 },
  savedNoteOpen: { flex: 1, minWidth: 0, alignItems: "center", gap: 8 },
  savedNoteTime: { color: "#FFFFFF", backgroundColor: "#275AC8", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, fontSize: 8, fontWeight: "900", writingDirection: "ltr", overflow: "hidden" },
  savedNoteBody: { flex: 1, fontSize: 9, lineHeight: 15, textAlign: "right", writingDirection: "rtl" },
  savedNoteDelete: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  notesEmpty: { fontSize: 9, lineHeight: 17, textAlign: "right" },
  errorCard: { marginTop: 40, alignItems: "center", gap: 13 },
  errorTitle: { fontSize: 19, fontWeight: "900" },
  errorText: { fontSize: 11, lineHeight: 19, textAlign: "center" },
});
