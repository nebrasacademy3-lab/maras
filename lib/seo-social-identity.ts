/** Filter already-normalized configured social URLs for Organization.sameAs.
 * Platform homepages, contact actions and search/share/login pages do not identify
 * this organization. This does not claim external verification of account ownership.
 */
export function organizationSocialIdentityUrls(urls: string[]) {
  const actions = new Set(["login", "signin", "signup", "home", "explore", "search", "intent", "share", "sharer.php", "watch", "shorts", "feed", "joinchat"]);
  return [...new Set(urls.flatMap(value => {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return [];
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (["wa.me", "whatsapp.com", "api.whatsapp.com", "youtu.be"].includes(host)) return [];
      const segments = url.pathname.split("/").filter(Boolean);
      if (!segments.length || actions.has(segments[0].toLowerCase()) || segments[0].startsWith("+")) return [];
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
      return [url.href];
    } catch { return []; }
  }))];
}
