import { router } from "expo-router";

export function openInternalRoute(actionUrl?: string | null) {
  if (!actionUrl || !actionUrl.startsWith("/") || actionUrl.startsWith("//")) return false;
  const [path = "", query = ""] = actionUrl.split("?", 2);

  if (path.startsWith("/learn/")) {
    const slug = decodeURIComponent(path.slice("/learn/".length));
    if (slug) router.push({ pathname: "/course/[slug]", params: { slug } });
    return Boolean(slug);
  }
  if (path.startsWith("/courses/")) {
    const slug = decodeURIComponent(path.slice("/courses/".length));
    if (slug) router.push({ pathname: "/course/[slug]", params: { slug } });
    return Boolean(slug);
  }
  if (path.startsWith("/course/")) {
    const slug = decodeURIComponent(path.slice("/course/".length));
    if (slug) router.push({ pathname: "/course/[slug]", params: { slug } });
    return Boolean(slug);
  }

  if (path === "/courses") router.push("/(tabs)/courses");
  else if (path === "/universities") router.push("/(tabs)/universities");
  else if (path === "/learning") router.push("/(tabs)/learning");
  else if (path === "/account") router.push("/(tabs)/account");
  else if (path === "/support") router.push("/support");
  else if (path === "/contact") router.push("/contact");
  else if (path === "/request-course" || path === "/requests") router.push("/requests");
  else if (path === "/supervisor") router.push("/supervisor");
  else if (path === "/admin") router.push("/admin");
  else if (path === "/notifications") router.push("/notifications");
  else if (path === "/cart") router.push("/cart");
  else if (path === "/favorites") router.push("/favorites");
  else if (path === "/orders") router.push("/orders");
  else if (path === "/profile") router.push("/profile");
  else if (path === "/dashboard") {
    const view = new URLSearchParams(query).get("view");
    if (view === "notifications") router.push("/notifications");
    else if (view === "account") router.push("/profile");
    else if (view === "requests") router.push("/requests");
    else if (view === "orders") router.push("/orders");
    else if (view === "learning") router.push("/(tabs)/learning");
    else router.push("/(tabs)");
  } else return false;

  return true;
}
