/** Only selects datasets needed by the current screen. Capability checks still apply independently. */
export const ADMIN_CONSOLE_DATASETS: Record<string, readonly string[]> = {
  overview: ["institutions", "courses", "orders", "metrics", "services"],
  institutions: ["institutions", "specialties", "links"],
  specialties: ["institutions", "specialties", "links"],
  courses: ["institutions", "specialties", "links", "courses"],
  content: ["courses", "units", "lessons", "videos"],
  students: ["users", "sessions", "devices", "institutions", "courses"],
  staff: ["users", "assignments", "institutions", "specialties", "links"],
  subscriptions: ["users", "courses", "access"],
  orders: ["orders", "courses"],
  requests: ["requests", "courses"],
  support: ["tickets"],
  reviews: ["reviews", "courses"],
  notifications: ["notifications"], coupons: ["coupons", "courses"],
  settings: ["settings"], audit: ["audit"],
};
export function adminConsoleNeeds(view: string, key: string, scoped: boolean) {
  return !scoped || Boolean(ADMIN_CONSOLE_DATASETS[view]?.includes(key));
}
