import { router } from "expo-router";
import { Linking } from "react-native";

export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || /^\/[\\]/.test(trimmed)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (/[\u0000-\u001f\s]/.test(trimmed)) return null;
  return trimmed;
}

export function openNotificationRoute(actionUrl: unknown) {
  if (typeof actionUrl !== "string" || !actionUrl) return;
  if (actionUrl.startsWith("https://")) {
    void Linking.openURL(actionUrl);
    return;
  }
  if (!actionUrl.startsWith("/") || actionUrl.startsWith("//")) return;
  const [path = "", query = ""] = actionUrl.split("?", 2);
  if (path === "/study-tools" || path.startsWith("/study-tools")) {
    const params = new URLSearchParams(query);
    const conversationId = params.get("conversation")?.trim();
    const quizId = params.get("quiz")?.trim();
    if (conversationId && /^[A-Za-z0-9_-]{1,120}$/.test(conversationId)) router.push({ pathname: "/ai/conversation/[id]", params: { id: conversationId } });
    else if (quizId && /^[A-Za-z0-9_-]{1,120}$/.test(quizId)) router.push({ pathname: "/ai/quiz/[id]", params: { id: quizId } });
    else router.push("/(tabs)/ai");
    return;
  }
  if (path === "/") {
    router.push("/(tabs)");
    return;
  }
  if (path === "/tracks" || path === "/learning-tracks" || path.startsWith("/tracks/") || path.startsWith("/learning-tracks/")) {
    router.push("/tracks");
    return;
  }
  if (path.startsWith("/r/")) {
    const code = decodeURIComponent(path.slice("/r/".length)).trim();
    if (code) router.push({ pathname: "/r/[code]", params: { code } });
    return;
  }
  if (path.startsWith("/learn/")) {
    const slug = decodeURIComponent(path.slice("/learn/".length));
    if (slug) router.push({ pathname: "/learn/[slug]", params: { slug } });
    return;
  }
  if (path.startsWith("/courses/")) {
    const slug = decodeURIComponent(path.slice("/courses/".length));
    if (slug) router.push({ pathname: "/course/[slug]", params: { slug } });
    return;
  }
  if (path === "/courses") router.push("/(tabs)/courses");
  else if (path === "/universities") router.push("/(tabs)/universities");
  else if (path === "/contact") router.push("/contact");
  else if (path === "/support") router.push("/support");
  else if (path === "/request-course" || path === "/requests") router.push("/requests");
  else if (path === "/notifications") router.push("/notifications");
  else if (path === "/referrals") router.push("/referrals");
  else if (path === "/cart") router.push("/cart");
  else if (path === "/favorites") router.push("/favorites");
  else if (path === "/orders") router.push("/orders");
  else if (path === "/admin") router.push("/admin");
  else if (path === "/supervisor") router.push("/supervisor");
  else if (path === "/dashboard") {
    const view = new URLSearchParams(query).get("view");
    if (view === "notifications") router.push("/notifications");
    else if (view === "account") router.push("/profile");
    else if (view === "requests") router.push("/requests");
    else if (view === "orders") router.push("/orders");
    else if (view === "courses") router.push("/(tabs)/learning");
    else router.push("/(tabs)");
  }
}
