import { router } from "expo-router";
import { Linking } from "react-native";

export function openNotificationRoute(actionUrl: unknown) {
  if (typeof actionUrl !== "string" || !actionUrl) return;
  if (actionUrl.startsWith("https://")) {
    void Linking.openURL(actionUrl);
    return;
  }
  if (!actionUrl.startsWith("/") || actionUrl.startsWith("//")) return;
  const [path = "", query = ""] = actionUrl.split("?", 2);
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
