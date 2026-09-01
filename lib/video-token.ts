export type VideoGrant = {
  courseSlug: string;
  lessonId: string;
  email: string;
  client?: "app" | "web";
  expiresAt: number;
};

function bytesToBase64Url(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createVideoToken(grant: VideoGrant, secret: string) {
  const encodedPayload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(grant)));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), new TextEncoder().encode(encodedPayload));
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyVideoToken(token: string, secret: string): Promise<VideoGrant | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await signingKey(secret), base64UrlToBytes(signature), new TextEncoder().encode(payload));
    if (!valid) return null;
    const grant = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as VideoGrant;
    if (!grant.courseSlug || !grant.lessonId || !Number.isFinite(grant.expiresAt) || grant.expiresAt <= Date.now()) return null;
    return grant;
  } catch {
    return null;
  }
}
