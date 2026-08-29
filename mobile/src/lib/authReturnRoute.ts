import type { Href } from "expo-router";

const COURSE_SLUG = /^[a-z0-9][a-z0-9._-]{1,79}$/i;
const LESSON_ID = /^[a-z0-9][a-z0-9._-]{1,99}$/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const STATIC_AUTH_RETURN_ROUTES: Readonly<Record<string, Href>> = {
  "/account": "/(tabs)/account",
  "/admin": "/admin",
  "/cart": "/cart",
  "/favorites": "/favorites",
  "/learning": "/(tabs)/learning",
  "/notifications": "/notifications",
  "/orders": "/orders",
  "/profile": "/profile",
  "/requests": "/requests",
  "/security": "/security",
  "/supervisor": "/supervisor",
  "/support": "/support",
};

export type AuthReturnRoute = Readonly<{
  href: Href;
  path: string;
}>;

/**
 * Resolves only the authenticated Expo routes that currently send users to
 * login. Arrays, external URLs, query strings, fragments, and malformed
 * dynamic segments are rejected instead of being passed to the router.
 */
export function resolveAuthReturnRoute(value: unknown): AuthReturnRoute | null {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("\\")
    || value.includes("?")
    || value.includes("#")
    || CONTROL_CHARACTER.test(value)
  ) return null;

  const staticRoute = STATIC_AUTH_RETURN_ROUTES[value];
  if (staticRoute) return { href: staticRoute, path: value };

  const segments = value.split("/");

  if (segments.length === 3 && segments[0] === "" && segments[1] === "course") {
    const slug = segments[2];
    if (!slug || !COURSE_SLUG.test(slug)) return null;
    return {
      href: { pathname: "/course/[slug]", params: { slug } },
      path: `/course/${slug}`,
    };
  }

  if (segments.length === 3 && segments[0] === "" && segments[1] === "learn") {
    const slug = segments[2];
    if (!slug || !COURSE_SLUG.test(slug)) return null;
    return {
      href: { pathname: "/learn/[slug]", params: { slug } },
      path: `/learn/${slug}`,
    };
  }

  if (segments.length === 4 && segments[0] === "" && segments[1] === "lesson") {
    const courseSlug = segments[2];
    const lessonId = segments[3];
    if (!courseSlug || !lessonId || !COURSE_SLUG.test(courseSlug) || !LESSON_ID.test(lessonId)) return null;
    return {
      href: { pathname: "/lesson/[courseSlug]/[lessonId]", params: { courseSlug, lessonId } },
      path: `/lesson/${courseSlug}/${lessonId}`,
    };
  }

  return null;
}

export function authGateHref(
  pathname: "/complete-profile" | "/onboarding",
  returnRoute: AuthReturnRoute | null,
): Href {
  return returnRoute
    ? { pathname, params: { return_to: returnRoute.path } }
    : pathname;
}
