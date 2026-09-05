import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { api, API_URL, ApiError, jsonBody } from "@/src/lib/api";

export type SocialProvider = "google" | "apple";
export const OAUTH_REDIRECT_URI = "merasalelm://oauth/callback";

export async function socialAuthCode(provider: SocialProvider, referralCode?: string) {
  // The verifier stays only in this process; a callback URL never contains a session token.
  const random = await Crypto.getRandomBytesAsync(32);
  const codeVerifier = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, codeVerifier, { encoding: Crypto.CryptoEncoding.BASE64 });
  const codeChallenge = digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const { url } = await api<{ url: string }>(`/api/auth/oauth/${provider}/start`, { method: "POST", body: jsonBody({ codeChallenge, redirectUri: OAUTH_REDIRECT_URI, ...(referralCode ? { referralCode: referralCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32) } : {}) }) });
  const providerUrl = new URL(url);
  const expectedOrigin = new URL(API_URL).origin;
  if (providerUrl.protocol !== "https:" || providerUrl.origin !== expectedOrigin || providerUrl.pathname !== `/api/auth/oauth/${provider}/start` || providerUrl.username || providerUrl.password) throw new ApiError("تعذر فتح تسجيل الدخول الآمن. حاول مرة أخرى.", 400);
  const result = await WebBrowser.openAuthSessionAsync(url, OAUTH_REDIRECT_URI, { preferEphemeralSession: false });
  if (result.type !== "success") return null;
  const callback = new URL(result.url);
  const expected = new URL(OAUTH_REDIRECT_URI);
  if (callback.protocol !== expected.protocol || callback.hostname !== expected.hostname || callback.pathname !== expected.pathname || callback.username || callback.password) throw new ApiError("رابط تسجيل الدخول غير صالح. ابدأ المحاولة من جديد.", 400);
  const code = callback.searchParams.get("code");
  if (callback.searchParams.has("error") || !code || !/^[a-zA-Z0-9_-]{24,256}$/.test(code)) throw new ApiError("لم يكتمل تسجيل الدخول. حاول مرة أخرى أو استخدم البريد الإلكتروني.", 400);
  return { code, codeVerifier };
}
