import "server-only";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { oauthExchanges, oauthIdentities, oauthStates, users } from "@/db/schema";
import { checkRateLimit, clientIp, createSession, DeviceLimitError, sameOriginRequest, sessionUserFromRow, validEmail } from "@/lib/auth";
import { accountNext, safeAccountReturnTo } from "@/lib/account-readiness";
import { ensureVerificationEmail } from "@/lib/email-verification";
import { provisionReferralCodeTx, recordReferralRegistrationTx, referralCodeFromRegistration } from "@/lib/referrals";
import { isUniqueConstraintError, jsonError } from "@/lib/api";
import { readBoundedFormData, readBoundedJsonObject } from "@/lib/request-body";
import { authorizationUrl, exchangeProviderCode, mobileOAuthRedirect, OAuthError, oauthConfig, oauthHash, oauthOrigin, oauthProvider, opaqueOAuthToken, pkceChallenge, type OAuthProvider } from "@/lib/oauth-provider";

const OPAQUE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const noStore = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
type StateRow = typeof oauthStates.$inferSelect;
function redirect(url: string, cookie?: string) {
  const headers = new Headers({ ...noStore, location: url });
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}
function cookieName(provider: OAuthProvider, state: string) {
  return `${oauthOrigin().startsWith("https:") ? "__Host-" : ""}meras_oauth_${provider}_${state.slice(0, 16)}`;
}
function bindingCookie(provider: OAuthProvider, state: string, value: string) {
  const secure = oauthOrigin().startsWith("https:");
  return `${cookieName(provider, state)}=${value}; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=${provider === "apple" ? "None" : "Lax"}; Max-Age=${value ? 600 : 0}`;
}
function bindingFromRequest(request: Request, provider: OAuthProvider, state: string) {
  const name = cookieName(provider, state);
  return (request.headers.get("cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="))?.slice(name.length + 1) || "";
}
async function allowed(request: Request, scope: string, limit = 40) {
  if (!await checkRateLimit(scope, clientIp(request), limit, 15 * 60)) throw new OAuthError("rate_limited");
}
async function pruneExpired() {
  const before = new Date(Date.now() - 86_400_000).toISOString();
  await Promise.all([
    getDb().delete(oauthStates).where(lt(oauthStates.expiresAt, before)),
    getDb().delete(oauthExchanges).where(lt(oauthExchanges.expiresAt, before)),
  ]);
}
export async function beginOAuth(request: Request, rawProvider: string) {
  try {
    const provider = oauthProvider(rawProvider);
    oauthConfig(provider);
    if (request.method === "POST" && !sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
    await allowed(request, "oauth-start");
    const now = new Date().toISOString();
    const url = new URL(request.url);
    const ticket = url.searchParams.get("ticket");
    // Native first obtains this one-time URL, then opens it in the system browser.
    // Binding is created IN that browser; an API client's cookies are insufficient.
    if (request.method === "GET" && ticket) {
      if (!OPAQUE.test(ticket)) throw new OAuthError("invalid_state");
      const binding = opaqueOAuthToken();
      const [row] = await getDb().update(oauthStates).set({ bindingHash: oauthHash(binding) }).where(and(
        eq(oauthStates.stateHash, oauthHash(ticket)), eq(oauthStates.provider, provider),
        isNull(oauthStates.bindingHash), isNull(oauthStates.usedAt), gt(oauthStates.expiresAt, now),
      )).returning();
      if (!row?.mobileChallenge || row.mobileRedirectUri !== mobileOAuthRedirect()) throw new OAuthError("invalid_state");
      return redirect(authorizationUrl(provider, ticket, row.nonce, row.verifier), bindingCookie(provider, ticket, binding));
    }
    const payload = request.method === "POST" ? await readBoundedJsonObject(request, 2048) : { referralCode: url.searchParams.get("ref") };
    const native = request.method === "POST";
    if (native && (typeof payload.codeChallenge !== "string" || !OPAQUE.test(payload.codeChallenge) || payload.redirectUri !== mobileOAuthRedirect())) throw new OAuthError("invalid_mobile_request");
    const state = opaqueOAuthToken(); const nonce = opaqueOAuthToken(); const verifier = opaqueOAuthToken();
    const binding = native ? "" : opaqueOAuthToken();
    const returnTo = safeAccountReturnTo(native ? payload.returnTo : url.searchParams.get("return_to"));
    await pruneExpired();
    await getDb().insert(oauthStates).values({
      stateHash: oauthHash(state), provider, bindingHash: binding ? oauthHash(binding) : null, nonce, verifier, returnTo,
      referralCode: referralCodeFromRegistration(payload, request) || null,
      mobileChallenge: native ? payload.codeChallenge as string : null,
      mobileRedirectUri: native ? mobileOAuthRedirect() : null,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
    if (native) return Response.json({ url: `${oauthOrigin()}/api/auth/oauth/${provider}/start?ticket=${state}` }, { headers: noStore });
    return redirect(authorizationUrl(provider, state, nonce, verifier), bindingCookie(provider, state, binding));
  } catch (error) {
    return request.method === "POST" ? oauthJsonError(error) : loginError(error);
  }
}

export async function claimOAuthState(request: Request, provider: OAuthProvider, state: string): Promise<StateRow> {
  if (!OPAQUE.test(state)) throw new OAuthError("invalid_state");
  const binding = bindingFromRequest(request, provider, state);
  if (!OPAQUE.test(binding)) throw new OAuthError("invalid_state");
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(oauthStates).where(and(
      eq(oauthStates.stateHash, oauthHash(state)), eq(oauthStates.provider, provider),
      eq(oauthStates.bindingHash, oauthHash(binding)), isNull(oauthStates.usedAt),
      gt(oauthStates.expiresAt, new Date().toISOString()),
    )).for("update").limit(1);
    if (!row) throw new OAuthError("invalid_state");
    await tx.update(oauthStates).set({ usedAt: new Date().toISOString(), verifier: "", nonce: "" }).where(eq(oauthStates.id, row.id));
    return row;
  });
}
export async function resolveOAuthAccount(provider: OAuthProvider, identity: Awaited<ReturnType<typeof exchangeProviderCode>>, request: Request, referralCode = "") {
  try {
    return await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"oauth:" + provider + ":" + identity.subject}))`);
      const [existing] = await tx.select({ user: users }).from(oauthIdentities).innerJoin(users, eq(oauthIdentities.userId, users.id))
        .where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.subject, identity.subject))).limit(1);
      if (existing) {
        if (existing.user.status !== "active") throw new OAuthError("account_unavailable");
        // Provider+subject owns the link. Never overwrite an existing verified email.
        return existing.user;
      }
      if (!identity.emailVerified || !validEmail(identity.email) || identity.email.length > 180) throw new OAuthError("email_required");
      const [collision] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${identity.email}`).limit(1);
      if (collision) throw new OAuthError("account_exists");
      const [created] = await tx.insert(users).values({
        email: identity.email, fullName: identity.name || "طالب مراس", role: "student", status: "active",
        // A provider-verified address is not platform verification: send our OTP once.
        emailVerifiedAt: null, profileCompletedAt: null, onboardingCompletedAt: null,
      }).returning();
      await tx.insert(oauthIdentities).values({ userId: created.id, provider, subject: identity.subject });
      const now = new Date().toISOString();
      await provisionReferralCodeTx(tx, created.id, now);
      await recordReferralRegistrationTx(tx, { referralCode, referredUserId: created.id, request, now });
      return created;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new OAuthError("account_exists");
    throw error;
  }
}
export async function finishOAuth(request: Request, rawProvider: string) {
  let row: StateRow | undefined; let state = ""; let provider: OAuthProvider | undefined;
  try {
    provider = oauthProvider(rawProvider);
    oauthConfig(provider);
    // Apple posts cross-site; its browser binding + state replace sameOriginRequest.
    if ((provider === "apple" && request.method !== "POST") || (provider === "google" && request.method !== "GET")) throw new OAuthError("invalid_state");
    await allowed(request, "oauth-callback", 80);
    const values = request.method === "POST" ? await readBoundedFormData(request, 20_480) : new URL(request.url).searchParams;
    state = String(values.get("state") || "");
    row = await claimOAuthState(request, provider, state);
    if (values.get("error")) throw new OAuthError("cancelled");
    const identity = await exchangeProviderCode(provider, String(values.get("code") || ""), row.nonce, row.verifier);
    const account = await resolveOAuthAccount(provider, identity, request, row.referralCode || "");
    await getDb().update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, account.id));
    const clearBinding = bindingCookie(provider, state, "");
    if (row.mobileChallenge) {
      if (row.mobileRedirectUri !== mobileOAuthRedirect()) throw new OAuthError("invalid_state");
      const code = opaqueOAuthToken();
      await getDb().insert(oauthExchanges).values({
        codeHash: oauthHash(code), userId: account.id, challenge: row.mobileChallenge,
        returnTo: row.returnTo, redirectUri: row.mobileRedirectUri, expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      return redirect(`${row.mobileRedirectUri}?code=${code}`, clearBinding);
    }
    const session = await createSession(account.id, request, true);
    if (!account.emailVerifiedAt) await ensureVerificationEmail(account.id, request);
    const next = accountNext(sessionUserFromRow(account));
    const target = next === "/dashboard" ? safeAccountReturnTo(row.returnTo) : `${next}?return_to=${encodeURIComponent(safeAccountReturnTo(row.returnTo))}`;
    const response = redirect(new URL(target, oauthOrigin()).toString(), clearBinding);
    response.headers.append("set-cookie", session.cookie);
    return response;
  } catch (error) {
    const response = row?.mobileRedirectUri && row.mobileRedirectUri === mobileOAuthRedirect()
      ? redirect(`${row.mobileRedirectUri}?error=${errorCode(error)}`) : loginError(error);
    if (provider && OPAQUE.test(state)) response.headers.append("set-cookie", bindingCookie(provider, state, ""));
    return response;
  }
}
export async function exchangeMobileOAuth(request: Request) {
  try {
    if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
    await allowed(request, "oauth-exchange", 80);
    const payload = await readBoundedJsonObject(request, 2048);
    if (typeof payload.code !== "string" || !OPAQUE.test(payload.code) || typeof payload.codeVerifier !== "string" || !VERIFIER.test(payload.codeVerifier)) throw new OAuthError("invalid_handoff");
    const codeHash = oauthHash(payload.code); const challenge = pkceChallenge(payload.codeVerifier);
    const row = await getDb().transaction(async (tx) => {
      const [result] = await tx.update(oauthExchanges).set({ usedAt: new Date().toISOString() }).where(and(
        eq(oauthExchanges.codeHash, codeHash), eq(oauthExchanges.challenge, challenge),
        eq(oauthExchanges.redirectUri, mobileOAuthRedirect()), isNull(oauthExchanges.usedAt),
        gt(oauthExchanges.expiresAt, new Date().toISOString()),
      )).returning();
      if (!result) throw new OAuthError("invalid_handoff");
      return result;
    });
    const [account] = await getDb().select().from(users).where(and(eq(users.id, row.userId), eq(users.status, "active"))).limit(1);
    if (!account) throw new OAuthError("account_unavailable");
    const session = await createSession(account.id, request, true);
    const user = sessionUserFromRow(account);
    if (!user.emailVerified) await ensureVerificationEmail(account.id, request);
    return Response.json({ token: session.token, expiresAt: session.expiresAt, user, next: accountNext(user, true) }, { headers: noStore });
  } catch (error) { return oauthJsonError(error); }
}
function errorCode(error: unknown) {
  return error instanceof DeviceLimitError ? "device_limit" : error instanceof OAuthError ? error.code : "provider_failed";
}
export function oauthErrorMessage(code: string) {
  const messages: Record<string, string> = {
    account_exists: "يوجد حساب بهذا البريد. سجّل الدخول بالطريقة الأصلية أو استخدم استعادة كلمة المرور؛ لن نربط حسابين تلقائيًا حفاظًا على أمانك.",
    provider_unavailable: "طريقة الدخول غير مفعّلة حاليًا. استخدم البريد الإلكتروني.",
    email_required: "لم نحصل على بريد موثّق من مزوّد الدخول. استخدم التسجيل بالبريد.",
    device_limit: "وصل حسابك إلى الحد المسموح من الأجهزة. سجّل الخروج من جهاز سابق أو تواصل مع الدعم.",
    cancelled: "لم يكتمل تسجيل الدخول. يمكنك المحاولة مرة أخرى.",
    rate_limited: "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.",
    account_unavailable: "تعذر الدخول إلى هذا الحساب. تواصل مع الدعم.",
    invalid_state: "انتهت محاولة الدخول أو لم نتمكن من التحقق منها. ابدأ المحاولة من جديد.",
    invalid_handoff: "انتهت محاولة الدخول للتطبيق. ابدأ المحاولة من جديد.",
  };
  return messages[code] || "تعذر تسجيل الدخول الآن. حاول مجددًا أو استخدم البريد الإلكتروني.";
}
function oauthJsonError(error: unknown) {
  const code = errorCode(error);
  return jsonError(oauthErrorMessage(code), code === "rate_limited" ? 429 : code === "provider_unavailable" ? 503 : 400, code);
}
function loginError(error: unknown) {
  // Fixed code only; no identity/provider message, code, or token in the URL.
  return redirect(`/login?oauth_error=${errorCode(error)}`);
}
