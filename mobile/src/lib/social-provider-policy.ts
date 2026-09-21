export function nativeSocialProviders(platform: string, configured?: { google: boolean; apple: boolean }) {
  const apple = platform !== "web" && Boolean(configured?.apple);
  return { apple, google: platform !== "web" && Boolean(configured?.google) && (platform !== "ios" || apple) };
}
