import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";

export type OAuthProvider = "google" | "apple";
export class OAuthError extends Error {
  constructor(readonly code: string) { super(code); this.name = "OAuthError"; }
}
export const opaqueOAuthToken = () => randomBytes(32).toString("base64url");
export const oauthHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const pkceChallenge = (value: string) => createHash("sha256").update(value).digest("base64url");
export function secureOAuthEqual(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function oauthProvider(value: string): OAuthProvider {
  if (value !== "google" && value !== "apple") throw new OAuthError("provider_unavailable");
  return value;
}
export function oauthOrigin() {
  const raw = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  let url: URL;
  try { url = new URL(raw); } catch { throw new OAuthError("provider_unavailable"); }
  if (url.username || url.password || (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new OAuthError("provider_unavailable");
  return url.origin;
}
export function mobileOAuthRedirect() {
  const raw = process.env.OAUTH_MOBILE_REDIRECT_URI?.trim() || "merasalelm://oauth/callback";
  let url: URL;
  try { url = new URL(raw); } catch { throw new OAuthError("provider_unavailable"); }
  // One exact app route, never a caller-controlled URL or a general URL prefix.
  if (url.protocol !== "merasalelm:" || url.host !== "oauth" || url.pathname !== "/callback" || url.search || url.hash || url.username || url.password) throw new OAuthError("provider_unavailable");
  return raw;
}
export function oauthConfig(provider: OAuthProvider) {
  const clientId = (provider === "google" ? process.env.GOOGLE_CLIENT_ID : process.env.APPLE_CLIENT_ID)?.trim() || "";
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
  if (!clientId || (provider === "google" ? !secret : !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY)) throw new OAuthError("provider_unavailable");
  const origin = oauthOrigin();
  if (provider === "apple" && !origin.startsWith("https://")) throw new OAuthError("provider_unavailable");
  return { clientId, secret, callback: `${origin}/api/auth/oauth/${provider}/callback` };
}
export function availableOAuthProviders() {
  const available = (provider: OAuthProvider) => { try { oauthConfig(provider); return true; } catch { return false; } };
  return { google: available("google"), apple: available("apple"), mobileRedirectUri: mobileOAuthRedirect() };
}
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 10_000 });
const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"), { timeoutDuration: 10_000 });

export async function verifyOAuthIdToken(token: string, provider: OAuthProvider, clientId: string, nonce: string, keys?: JWTVerifyGetKey) {
  const issuer = provider === "google" ? ["https://accounts.google.com", "accounts.google.com"] : "https://appleid.apple.com";
  const { payload } = await jwtVerify(token, keys || (provider === "google" ? googleKeys : appleKeys), {
    algorithms: ["RS256"], issuer, audience: clientId, maxTokenAge: "10m",
    requiredClaims: ["sub", "iat", "exp", "nonce"], clockTolerance: 5,
  });
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255 || typeof payload.nonce !== "string" || !secureOAuthEqual(payload.nonce, nonce)) throw new OAuthError("invalid_identity");
  if (payload.azp !== undefined && payload.azp !== clientId) throw new OAuthError("invalid_identity");
  if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId) throw new OAuthError("invalid_identity");
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const emailVerified = payload.email_verified === true || (provider === "apple" && payload.email_verified === "true");
  const name = typeof payload.name === "string" ? payload.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) : "";
  return { subject: payload.sub, email, emailVerified, name };
}
export async function appleClientSecret(clientId: string) {
  const privateKey = await importPKCS8((process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID! })
    .setIssuer(process.env.APPLE_TEAM_ID!).setSubject(clientId).setAudience("https://appleid.apple.com")
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
}
export function authorizationUrl(provider: OAuthProvider, state: string, nonce: string, verifier: string) {
  const config = oauthConfig(provider);
  const url = new URL(provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://appleid.apple.com/auth/authorize");
  url.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.callback, response_type: "code",
    scope: provider === "google" ? "openid email profile" : "name email", state, nonce,
    ...(provider === "google" ? { code_challenge: pkceChallenge(verifier), code_challenge_method: "S256", prompt: "select_account" } : { response_mode: "form_post" }),
  }).toString();
  return url.toString();
}
export async function exchangeProviderCode(provider: OAuthProvider, code: string, nonce: string, verifier: string) {
  if (!code || code.length > 4096) throw new OAuthError("invalid_identity");
  const config = oauthConfig(provider);
  const response = await fetch(provider === "google" ? "https://oauth2.googleapis.com/token" : "https://appleid.apple.com/auth/token", {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000),
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, client_id: config.clientId, redirect_uri: config.callback,
      client_secret: provider === "google" ? config.secret : await appleClientSecret(config.clientId),
      ...(provider === "google" ? { code_verifier: verifier } : {}),
    }),
  });
  if (!response.ok) throw new OAuthError("provider_failed");
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || !("id_token" in value) || typeof value.id_token !== "string" || value.id_token.length > 16_384) throw new OAuthError("invalid_identity");
  // Access/refresh tokens are deliberately discarded, never persisted or returned.
  return verifyOAuthIdToken(value.id_token, provider, config.clientId, nonce);
}
