import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("notification read state has one per-user source of truth across inbox and dashboard", async () => {
  const [inbox, dashboardApi, dashboardPage, webDashboard, mobileInbox] = await Promise.all([
    read("app/api/mobile/notifications/route.ts"),
    read("app/api/mobile/dashboard/route.ts"),
    read("app/dashboard/page.tsx"),
    read("components/student-dashboard.tsx"),
    read("mobile/app/notifications.tsx"),
  ]);

  assert.match(inbox, /leftJoin\(notificationReads/);
  assert.match(inbox, /db\.transaction/);
  assert.match(inbox, /onConflictDoUpdate/);
  assert.match(inbox, /unreadCount: Number\(remaining/);

  // GET must count every visible unread notification independently of the 500-row inbox page.
  assert.match(inbox, /const \[selected, \[unreadRow\]\] = await Promise\.all/);
  assert.match(
    inbox,
    /db\.select\(\{ value: count\(\) \}\)[\s\S]*?leftJoin\(notificationReads,[\s\S]*?isNull\(notificationReads\.readAt\)/,
  );
  assert.match(inbox, /unreadCount: Number\(unreadRow\?\.value \|\| 0\)/);
  assert.doesNotMatch(inbox, /unreadCount: rows\.filter/);

  assert.match(dashboardApi, /notificationReads\.readAt/);
  assert.match(dashboardApi, /readAt: row\.readAt/);
  assert.match(dashboardPage, /leftJoin\(notificationReads/);
  assert.match(dashboardPage, /read:Boolean\(readAt\)/);

  // A stale refresh must not restore unread rows during an optimistic read mutation.
  assert.match(webDashboard, /notificationRevisionRef/);
  assert.match(webDashboard, /pendingReadIdsRef/);
  assert.match(webDashboard, /notificationsAreCurrent/);

  assert.match(mobileInbox, /onError:/);
  assert.match(mobileInbox, /context\?\.previous/);
  assert.doesNotMatch(mobileInbox, /useFocusEffect/);
});

test("logout revokes server credentials and clears user-specific client caches", async () => {
  const [route, webClient, mobileAuth, supervisor] = await Promise.all([
    read("app/api/auth/logout/route.ts"),
    read("components/web-logout.ts"),
    read("mobile/src/providers/AuthProvider.tsx"),
    read("components/supervisor-dashboard.tsx"),
  ]);

  assert.match(route, /revokeSession\(request\)/);
  assert.match(route, /clearAdminStepUpCookie\(request\)/);
  assert.match(route, /headers\.append\("set-cookie"/);

  // Logout is mutation-only; the browser fallback must remain a POST.
  assert.doesNotMatch(route, /export async function GET/);
  assert.match(webClient, /resetCommerce\(\)/);
  assert.match(webClient, /removeItem\("meras_session_token"\)/);
  assert.match(webClient, /method: "POST"/);
  assert.match(webClient, /navigator\.sendBeacon\("\/api\/auth\/logout"/);
  assert.doesNotMatch(webClient, /\/api\/auth\/logout\?to=/);

  // Local state clears immediately, while remote revocation gets only a short bounded wait.
  assert.match(mobileAuth, /setUser\(null\)/);
  assert.match(mobileAuth, /setToken\(null\)/);
  assert.match(mobileAuth, /queryClient\.clear\(\)/);
  assert.match(mobileAuth, /api\("\/api\/mobile\/auth\/logout"/);
  assert.match(mobileAuth, /timeoutMs: 2_000/);
  assert.match(mobileAuth, /await Promise\.all/);
  assert.match(mobileAuth, /console\.warn/);

  assert.match(supervisor, /supervisor-logout/);
  assert.match(supervisor, /signOutWeb/);
});

test("brand lockup and public campaign stay visually stable in both themes", async () => {
  const [brandCss, mobileBrand, campaign, campaignCss, mobileCampaign] = await Promise.all([
    read("app/brand-premium.css"),
    read("mobile/src/components/Brand.tsx"),
    read("components/announcement-campaign.tsx"),
    read("app/campaigns.css"),
    read("mobile/src/components/AnnouncementCampaign.tsx"),
  ]);

  assert.match(brandCss, /brand-logo-dark \{ transform: scale\(1\.36\)/);
  assert.match(brandCss, /font-family: Tahoma/);
  assert.match(mobileBrand, /darkArtwork/);
  assert.match(mobileBrand, /Geeza Pro/);
  assert.match(campaign, /announcement-ticker/);
  assert.match(campaign, /--announcement-bar-height/);
  assert.match(campaignCss, /position: sticky/);
  assert.match(campaignCss, /announcement-ticker 24s/);
  assert.match(mobileCampaign, /MarqueeText/);
  assert.match(mobileCampaign, /presentation==="all"&&seenModal/);
});

test("notification deep links and account navigation cover referrals and Meras tools artifacts", async () => {
  const [routing, account, webHeader] = await Promise.all([
    read("mobile/src/lib/notification-routing.ts"),
    read("mobile/app/(tabs)/account.tsx"),
    read("components/site-header.tsx"),
  ]);

  assert.match(routing, /path === "\/study-tools"/);
  assert.match(routing, /\/ai\/conversation\/\[id\]/);
  assert.match(routing, /\/ai\/quiz\/\[id\]/);
  assert.match(routing, /path === "\/referrals"/);
  assert.match(account, /title: "أدوات مراس"/);
  assert.match(account, /title: "الإحالات والهدايا"/);
  assert.match(webHeader, /href: "\/study-tools".+mobileOnly: true/);
  assert.match(webHeader, /href: "\/referrals".+mobileOnly: true/);
  assert.match(webHeader, /className="account-utilities-menu desktop-only"/);
});
