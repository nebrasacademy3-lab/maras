/** Rewrite only known web routes; malformed links must never crash startup. */
export function resolveAppLink(value: string, host = "marasalelm.com") {
  try {
    if (!value || /[\u0000-\u0020\\]/.test(value) || value.startsWith("//")) return "/(tabs)";
    let url: URL;
    if (value.startsWith("/")) url = new URL(value, `https://${host}`);
    else {
      url = new URL(value);
      if (url.username || url.password) return "/(tabs)";
      if (url.protocol === "merasalelm:") url = new URL(`/${url.hostname}${url.pathname}${url.search}`, `https://${host}`);
      else if (url.protocol !== "https:" || url.host !== host) return "/(tabs)";
    }
    // Validate percent escapes and forbid encoded path separators in route IDs.
    const path = url.pathname;
    decodeURIComponent(path);
    if (/%(?:2f|5c)/i.test(path)) return "/(tabs)";
    if (path === "/dashboard") {
      const view = url.searchParams.get("view");
      return ({ courses: "/(tabs)/learning", account: "/profile", orders: "/orders", notifications: "/notifications", requests: "/requests", support: "/support" } as Record<string, string>)[view || ""] || "/(tabs)";
    }
    if (path.startsWith("/courses/")) return `/course/${path.slice(9)}${url.search}`;
    if (path === "/courses") return "/(tabs)/courses";
    if (path === "/universities") return "/(tabs)/universities";
    if (path === "/study-tools" || path === "/meras-ai") {
      const conversation = url.searchParams.get("conversation"); const quiz = url.searchParams.get("quiz");
      if (conversation && /^[A-Za-z0-9_-]{1,120}$/.test(conversation)) return `/ai/conversation/${conversation}`;
      if (quiz && /^[A-Za-z0-9_-]{1,120}$/.test(quiz)) return `/ai/quiz/${quiz}`;
      return "/(tabs)/ai";
    }
    if (path === "/learning-tracks") return "/tracks";
    if (path === "/") return "/(tabs)";
    if (/^\/(?:r|learn|lesson|course|university)\/[^/]+$/.test(path) || /^\/(?:support|contact|cart|favorites|profile|requests|orders|notifications|referrals|tracks|verify-email|reset-password|forgot-password|complete-profile|onboarding|assistant|security)$/.test(path) || path === "/oauth/callback" || path.startsWith("/(auth)/") || path.startsWith("/(tabs)")) return path + url.search;
    return "/(tabs)";
  } catch { return "/(tabs)"; }
}
