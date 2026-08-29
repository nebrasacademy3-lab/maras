/* eslint-disable react-hooks/immutability, react-hooks/refs -- Expo Video and Animated expose imperative native objects by design. */
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useEvent } from "expo";
import * as ScreenCapture from "expo-screen-capture";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, BackHandler, Platform, Pressable, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, LoadingState, Screen } from "@/src/components/ui";
import { absoluteUrl, api, ApiError, getApiToken, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import type { Catalog } from "@/src/types";

const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
const qualities = ["تلقائي", "الأصلية"] as const;

type Origin = "learn" | "course";

export default function LessonPlayer() {
  const { courseSlug, lessonId, from } = useLocalSearchParams<{ courseSlug: string; lessonId: string; from?: Origin }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { direction, rowDirection, startAlignment } = useLanguage();
  const origin: Origin = from === "course" ? "course" : "learn";

  const [course, setCourse] = useState<Catalog["courses"][number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playbackError, setPlaybackError] = useState("");
  const [privateOverlay, setPrivateOverlay] = useState(false);
  const [note, setNote] = useState("");
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
  const videoRef = useRef<VideoView>(null);
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
    try { player.pause(); } catch { /* Player may already be released. */ }
    void player.replaceAsync(null).catch(() => undefined);
  }, [player]);

  const leavePlayer = useCallback(() => {
    releaseVideo();
    router.dismissTo(returnHref as never);
  }, [releaseVideo, returnHref]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      leavePlayer();
      return true;
    });
    return () => subscription.remove();
  }, [leavePlayer]);

  useEffect(() => {
    void ScreenCapture.preventScreenCaptureAsync("meras-lesson");
    const subscription = AppState.addEventListener("change", (state) => {
      setPrivateOverlay(state !== "active");
      if (state !== "active") player.pause();
    });
    return () => {
      subscription.remove();
      releaseVideo();
      void ScreenCapture.allowScreenCaptureAsync("meras-lesson");
    };
  }, [player, releaseVideo]);

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(watermark, { toValue: 1, duration: 9000, useNativeDriver: true }),
      Animated.timing(watermark, { toValue: 0, duration: 9000, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [watermark]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(player.currentTime || 0);
      setDuration(player.duration || 0);
    }, 400);
    return () => clearInterval(timer);
  }, [player]);

  useEffect(() => {
    if (statusEvent.status === "error") {
      const detail = "error" in statusEvent && statusEvent.error?.message ? statusEvent.error.message : "";
      setPlaybackError(detail || "تعذر تشغيل ملف الفيديو. أعد المحاولة أو تواصل مع الدعم إذا استمرت المشكلة.");
    } else if (statusEvent.status === "readyToPlay") {
      setPlaybackError("");
    }
  }, [statusEvent]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      setPlaybackError("");
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
        setCourse(selected);

        const session = await api<{ streamUrl: string; expiresAt: string }>("/api/video/session", {
          method: "POST",
          body: jsonBody({ courseSlug, lessonId }),
        });
        if (cancelled) return;

        const token = getApiToken();
        const headers: Record<string, string> = { Accept: "video/*" };
        if (token) headers.Authorization = `Bearer ${token}`;

        await player.replaceAsync({
          uri: absoluteUrl(session.streamUrl),
          headers,
          contentType: "progressive",
          useCaching: false,
          metadata: { title: selectedLesson.title, artist: "مراس العلم" },
        });
        if (cancelled) return;

        const progress = await api<{ progress: { lessonId: string; watchedSeconds: number }[] }>(
          `/api/progress?course=${encodeURIComponent(courseSlug || "")}`,
        ).catch(() => ({ progress: [] }));
        const saved = progress.progress.find((item) => item.lessonId === lessonId);
        if (saved?.watchedSeconds && Number.isFinite(saved.watchedSeconds)) player.currentTime = saved.watchedSeconds;

        const noteResult = await api<{ note: { body: string } | null }>(
          `/api/mobile/notes?lesson=${encodeURIComponent(lessonId || "")}`,
        ).catch(() => ({ note: null }));
        if (!cancelled) setNote(noteResult.note?.body || "");
        if (!cancelled) player.play();
      } catch (reason) {
        if (!cancelled) setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "تعذر تشغيل الدرس");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [courseSlug, lessonId, player, retryKey]);

  useEffect(() => {
    if (!user || !courseSlug || !lessonId) return;
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
  }, [courseSlug, lessonId, player, user]);

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
    try {
      await api("/api/mobile/notes", { method: "PUT", body: jsonBody({ lessonId, body: note }) });
      setNoteMessage("تم حفظ الملاحظة");
    } catch {
      setNoteMessage("تعذر حفظ الملاحظة");
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
    <Screen padded={false} showFooter={false}>
      <View style={styles.headerPad}>
        <AppHeader title={lesson.title} subtitle={course.title} back onBack={leavePlayer} />
      </View>

      <View style={styles.playerWrap}>
        <VideoView
          ref={videoRef}
          player={player}
          style={styles.video}
          nativeControls={false}
          contentFit="contain"
          allowsPictureInPicture={false}
          allowsVideoFrameAnalysis={false}
          fullscreenOptions={{ enable: true }}
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
          <Pressable accessibilityLabel="تشغيل" onPress={() => player.play()} style={styles.centerPlay}>
            <Ionicons name="play" size={31} color="#FFFFFF" />
          </Pressable>
        ) : null}

        {privateOverlay ? <View style={styles.privacy}><Ionicons name="shield-checkmark" size={40} color="#FFFFFF" /><Text style={styles.privacyText}>المحتوى محمي داخل مراس</Text></View> : null}

        <View style={styles.controls}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={Math.max(duration, 1)}
            value={Math.min(time, Math.max(duration, 1))}
            onValueChange={setTime}
            onSlidingComplete={(value) => { player.currentTime = value; }}
            minimumTrackTintColor="#4D82FF"
            maximumTrackTintColor="rgba(255,255,255,.25)"
            thumbTintColor="#FFFFFF"
          />
          <View style={[styles.controlsRow, { flexDirection: rowDirection }]}>
            <View style={[styles.controlsMain, { flexDirection: rowDirection }]}>
              <PlayerButton icon={isPlaying ? "pause" : "play"} onPress={() => isPlaying ? player.pause() : player.play()} />
              <PlayerButton icon="play-back" label="10" onPress={() => seek(-10)} />
              <PlayerButton icon="play-forward" label="10" onPress={() => seek(10)} />
              <PlayerButton icon={muted ? "volume-mute" : "volume-high"} onPress={toggleMute} />
              <Text style={styles.timeText}>{formatTime(time)} / {formatTime(duration)}</Text>
            </View>
            <View style={[styles.controlsSide, { flexDirection: rowDirection }]}>
              <PlayerButton icon="text" active={captions} onPress={() => setCaptions((value) => !value)} />
              <Pressable style={styles.labelButton} onPress={() => setSettingsOpen((value) => !value)}><Text style={styles.labelButtonText}>{rate}×</Text></Pressable>
              <PlayerButton icon="settings-outline" active={settingsOpen} onPress={() => setSettingsOpen((value) => !value)} />
              <PlayerButton icon="expand-outline" onPress={() => void videoRef.current?.enterFullscreen()} />
            </View>
          </View>
        </View>

        {settingsOpen ? (
          <View style={[styles.settings, { direction }]}>
            <View style={[styles.settingsHead, { flexDirection: rowDirection }]}><Ionicons name="settings-outline" size={16} color="#FFFFFF" /><Text style={styles.settingsTitle}>إعدادات المشاهدة</Text><Pressable onPress={() => setSettingsOpen(false)}><Ionicons name="close" size={19} color="#FFFFFF" /></Pressable></View>
            <Text style={styles.settingsLabel}>السرعة</Text>
            <View style={[styles.chips, { flexDirection: rowDirection, justifyContent: startAlignment }]}>{rates.map((value) => <Pressable key={value} onPress={() => changeRate(value)} style={[styles.chip, rate === value && styles.chipActive]}><Text style={styles.chipText}>{value}×</Text></Pressable>)}</View>
            <Text style={styles.settingsLabel}>الجودة</Text>
            <View style={[styles.chips, { flexDirection: rowDirection, justifyContent: startAlignment }]}>{qualities.map((value) => <Pressable key={value} onPress={() => setQuality(value)} style={[styles.chip, quality === value && styles.chipActive]}><Text style={styles.chipText}>{value}</Text></Pressable>)}</View>
            <Text style={styles.settingsHelp}>يُعرض الفيديو بالحجم الأصلي داخل الإطار بدون قص أو تقريب.</Text>
            <Text style={styles.settingsLabel}>الصوت</Text>
            <Slider style={styles.volumeSlider} minimumValue={0} maximumValue={1} step={0.05} value={muted ? 0 : volume} onValueChange={changeVolume} minimumTrackTintColor="#4D82FF" maximumTrackTintColor="rgba(255,255,255,.25)" thumbTintColor="#FFFFFF" />
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        <View style={[styles.navigationRow, { flexDirection: rowDirection }]}>
          <AppButton full={false} title="السابق" variant="soft" icon="chevron-forward" disabled={!previousLesson} onPress={() => previousLesson && openLesson(previousLesson.id)} />
          <AppButton full={false} title="التالي" variant="soft" icon="chevron-back" disabled={!nextLesson} onPress={() => nextLesson && openLesson(nextLesson.id)} />
        </View>
        <Text style={[styles.lessonTitle, { color: colors.text }]}>{lesson.title}</Text>
        <Text style={[styles.protection, { color: colors.textSoft }]}><Ionicons name="shield-checkmark-outline" size={14} color={colors.success} /> بث محمي · عرض كامل بدون قص · حفظ تقدم تلقائي</Text>
        <Card style={styles.notes}>
          <Text style={[styles.notesTitle, { color: colors.text }]}>ملاحظاتي على الدرس</Text>
          <TextInput multiline value={note} onChangeText={setNote} placeholder="اكتب نقاطك المهمة هنا..." placeholderTextColor={colors.textSoft} style={[styles.noteInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
          <AppButton title="حفظ الملاحظة" variant="soft" icon="save-outline" onPress={saveNote} />
          {noteMessage ? <Text style={[styles.noteMessage, { color: noteMessage.startsWith("تم") ? colors.success : colors.danger }]}>{noteMessage}</Text> : null}
        </Card>
      </View>
    </Screen>
  );
}

function PlayerButton({ icon, label, active = false, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label?: string; active?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.playerButton, active && styles.playerButtonActive]}><Ionicons name={icon} size={18} color="#FFFFFF" />{label ? <Text style={styles.playerButtonLabel}>{label}</Text> : null}</Pressable>;
}

function formatTime(value: number) {
  const total = Math.max(0, Math.floor(value || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  headerPad: { paddingHorizontal: 18 },
  playerWrap: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000000", position: "relative", overflow: "hidden" },
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
  controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  controlsMain: { flexDirection: "row", alignItems: "center", gap: 2 },
  controlsSide: { flexDirection: "row", alignItems: "center", gap: 2 },
  playerButton: { minWidth: 31, height: 31, borderRadius: 8, paddingHorizontal: 5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 1 },
  playerButtonActive: { backgroundColor: "rgba(255,255,255,.14)" },
  playerButtonLabel: { color: "#FFFFFF", fontSize: 6, marginLeft: -4, marginTop: -1 },
  labelButton: { minWidth: 38, height: 31, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  labelButtonText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  timeText: { color: "rgba(255,255,255,.74)", fontSize: 8, marginStart: 4, writingDirection: "ltr" },
  settings: { position: "absolute", start: 10, bottom: 51, width: 272, maxWidth: "88%", padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,.16)", borderRadius: 14, backgroundColor: "rgba(5,12,31,.96)" },
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
  privacy: { position: "absolute", zIndex: 30, top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#02050B", alignItems: "center", justifyContent: "center", gap: 10 },
  privacyText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  content: { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 30 },
  navigationRow: { flexDirection: "row", gap: 8, justifyContent: "space-between", marginBottom: 15 },
  lessonTitle: { fontSize: 21, lineHeight: 31, fontWeight: "900", textAlign: "right" },
  protection: { fontSize: 9, textAlign: "right", marginTop: 7 },
  notes: { marginTop: 20 },
  notesTitle: { fontSize: 14, fontWeight: "900", textAlign: "right", marginBottom: 11 },
  noteInput: { minHeight: 140, borderWidth: 1, borderRadius: 15, padding: 12, textAlignVertical: "top", writingDirection: "rtl", marginBottom: 10 },
  noteMessage: { fontSize: 9, textAlign: "center", marginTop: 8 },
  errorCard: { marginTop: 40, alignItems: "center", gap: 13 },
  errorTitle: { fontSize: 19, fontWeight: "900" },
  errorText: { fontSize: 11, lineHeight: 19, textAlign: "center" },
});
