import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
async function isolated(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const key = "__emailBranding" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const input = "const {" + Object.keys(dependencies).join(",") + "} = globalThis[" + JSON.stringify(key) + "];\n" + source.replace(/^import .+;\r?\n/gm, "");
    return await import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64"));
  } finally { delete globalThis[key]; }
}
const social = await isolated("../lib/social-links.ts");
const branding = await isolated("../lib/email-branding.ts", social);
const origin = "https://marasalelm.com";
const token = "opaque_test_reset_token_0123456789abcdefABCDEF";
const contentFor = kind => kind === "reset-password" ? { kind, resetUrl: `${origin}/reset-password?token=${token}` } : { kind, code: "012345" };
const kinds = ["verify-email", "change-password", "reset-password"];

async function setup({ settings = {}, environment = {}, delivery = async () => Response.json({ id: "isolated-email-id" }) } = {}) {
  const calls = { settings: 0, files: [], provider: [] };
  const state = { settings };
  const env = { APP_URL: origin, RESEND_API_KEY: "isolated-provider-key-not-real", EMAIL_FROM: "Meras <no-reply@example.test>", ...environment };
  const renderer = await isolated("../lib/email-renderer.ts", {
    ...branding, join,
    readFile: async (...args) => { calls.files.push(args[0]); return readFile(...args); },
    getPublicSettings: async () => { calls.settings += 1; return state.settings; },
    process: { env, cwd: () => root },
  });
  const sender = await isolated("../lib/transactional-email.ts", {
    ...branding, ...renderer, process: { env },
    fetch: async (url, options) => { calls.provider.push({ url, options, body: JSON.parse(options.body) }); return delivery(); },
  });
  const send = (kind = "verify-email", overrides = {}) => sender.sendTransactionalEmail({ to: "student@example.test", subject: "أمان حساب مراس العلم", text: "نص احتياطي آمن: 012345", idempotencyKey: "isolated-delivery-1", security: contentFor(kind), ...overrides });
  return { calls, state, env, send, ...renderer, ...sender };
}

test("all three real templates render current-domain branded HTML and preserve leading zero codes", async () => {
  const s = await setup({ settings: { social_x: "https://x.com/our_saved_account", social_instagram: "https://instagram.com/our_saved_account" } });
  for (const kind of kinds) {
    const { html, variables } = await s.prepareSecurityEmail(contentFor(kind));
    assert.match(html, /<html[^>]+lang="ar"[^>]+dir="rtl"/);
    assert.ok(html.includes(`${origin}/brand/logo-light-hq.png`));
    assert.ok(html.includes(`${origin}/email-assets/x.png`));
    assert.ok(html.includes("https://x.com/our_saved_account"));
    assert.ok(html.includes("https://instagram.com/our_saved_account"));
    assert.doesNotMatch(html, /\{\{\{|marase\.up\.railway\.app/);
    assert.match(html, /مراس العلم/);
    if (kind !== "reset-password") {
      assert.equal(variables.CODE, "012345");
      assert.ok(html.includes("012345"));
      assert.equal(variables.RESET_URL, undefined);
    } else {
      assert.equal(variables.CODE, undefined);
      assert.equal(variables.RESET_URL, `${origin}/reset-password?token=${token}`);
      assert.ok(html.includes(variables.RESET_URL));
    }
  }
  assert.equal(s.calls.settings, 3);
  assert.equal(new Set(s.calls.files).size, 3);
});

test("verification and password-change codes reject malformed length, markup and non-Latin digits", () => {
  for (const kind of ["verify-email", "change-password"]) {
    for (const code of ["", "12345", "1234567", "12345x", " 123456", "123456\n", "١٢٣٤٥٦", "<b>x</b>"]) {
      assert.throws(() => branding.securityEmailVariables({ kind, code }, {}, origin), /Invalid verification code/, `${kind}: ${JSON.stringify(code)}`);
    }
  }
});

test("reset links require the configured origin, exact route and one sufficiently strong token only", () => {
  for (const resetUrl of [
    `https://evil.example/reset-password?token=${token}`,
    `http://marasalelm.com/reset-password?token=${token}`,
    `https://user:pass@marasalelm.com/reset-password?token=${token}`,
    `${origin}/reset-password/other?token=${token}`,
    `${origin}/reset-password?token=${token}&token=${token}`,
    `${origin}/reset-password?token=${token}&redirect=https://evil.example`,
    `${origin}/reset-password?token=${token}#fragment`,
    `${origin}/reset-password`, `${origin}/reset-password?token=short`,
    `${origin}/reset-password?token=${"a".repeat(257)}`,
    `${origin}/reset-password?token=%22%3E%3Cscript%3E`,
  ]) assert.throws(() => branding.securityEmailVariables({ kind: "reset-password", resetUrl }, {}, origin), /Invalid password reset link/);
  assert.equal(branding.securityEmailVariables(contentFor("reset-password"), {}, origin).RESET_URL, contentFor("reset-password").resetUrl);
  assert.equal(branding.emailSiteOrigin(), origin);
  for (const configured of ["http://marasalelm.com", "https://user:pass@marasalelm.com", "javascript:alert(1)"]) assert.throws(() => branding.emailSiteOrigin(configured));
});

test("local HTTP is explicitly opt-in and limited to exact loopback hosts", () => {
  for (const local of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
    assert.throws(() => branding.emailSiteOrigin(local));
    assert.equal(branding.emailSiteOrigin(local, { allowLocalHttp: true }), local);
    assert.equal(branding.configuredEmailOrigin({ NODE_ENV: "development", APP_URL: local }), local);
    for (const NODE_ENV of ["production", "test", "", undefined]) assert.throws(() => branding.configuredEmailOrigin({ NODE_ENV, APP_URL: local }));
  }
  for (const unsafe of ["http://marasalelm.com", "http://localhost.evil.example:3000", "http://192.168.1.5:3000", "http://evil.example", "http://user:pass@localhost:3000", "http://localhost@evil.example:3000", "ftp://localhost:3000", "javascript:alert(1)"]) {
    assert.throws(() => branding.emailSiteOrigin(unsafe, { allowLocalHttp: true }), unsafe);
  }
  assert.equal(branding.configuredEmailOrigin({ NODE_ENV: "production" }), origin);
  assert.equal(branding.configuredEmailOrigin({ NODE_ENV: "production", APP_URL: " ", NEXT_PUBLIC_SITE_URL: "https://example.test/path" }), "https://example.test");
});

test("development sends all three templates with local actions and public HTTPS images even with hosted IDs", async () => {
  for (const local of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
    const environment = { NODE_ENV: "development", APP_URL: local, ...Object.fromEntries(kinds.map(kind => [branding.EMAIL_TEMPLATE_ENV[kind], `meras-${kind}`])) };
    const s = await setup({ environment, settings: { social_x: "https://x.com/our_saved_account" } });
    for (const kind of kinds) {
      const security = kind === "reset-password" ? { kind, resetUrl: `${local}/reset-password?token=${token}` } : { kind, code: "012345" };
      const prepared = await s.prepareSecurityEmail(security);
      assert.equal(prepared.allowHostedTemplate, false);
      assert.equal(prepared.variables.LOGO_URL, `${origin}/brand/logo-light-hq.png`);
      assert.ok(prepared.variables.SOCIAL_1.includes(`${origin}/email-assets/x.png`));
      assert.ok(prepared.html.includes(`href="${local}/`));
      assert.doesNotMatch(prepared.html, /src="http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])/);
      if (kind === "reset-password") assert.equal(prepared.variables.RESET_URL, security.resetUrl);
      else assert.equal(prepared.variables.CODE, "012345");
      await s.send(kind, { security });
      const body = s.calls.provider.at(-1).body;
      assert.equal(body.template, undefined);
      assert.equal(body.html, prepared.html);
      assert.ok(body.text);
    }
  }
});

test("production HTTP misconfiguration fails closed before sending codes or reset links", async () => {
  for (const local of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
    const s = await setup({ environment: { NODE_ENV: "production", APP_URL: local } });
    for (const kind of kinds) await assert.rejects(s.send(kind), error => error.code === "EMAIL_DELIVERY_FAILED");
    assert.equal(s.calls.provider.length, 0);
  }
  const options = { allowLocalHttp: true };
  assert.throws(() => branding.securityEmailVariables({ kind: "verify-email", code: "<b>bad</b>" }, {}, "http://localhost:3000", options), /Invalid verification code/);
  for (const resetUrl of [`http://localhost.evil.example:3000/reset-password?token=${token}`, `http://localhost:3000/reset-password?token=${token}&next=https://evil.example`, "http://localhost:3000/reset-password?token=short"]) {
    assert.throws(() => branding.securityEmailVariables({ kind: "reset-password", resetUrl }, {}, "http://localhost:3000", options), /Invalid password reset link/);
  }
});

test("forgot-password uses the same canonical resolver instead of request Host including missing APP_URL", async () => {
  for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://example.test" }, { NODE_ENV: "production", APP_URL: origin + "/ignored-path" }, { NODE_ENV: "development", APP_URL: "http://localhost:3000" }]) {
    const messages = [];
    let invalidated = false;
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 91, fullName: "Test Student" }] }) }) }),
      insert: () => ({ values: async () => undefined }),
      update: () => ({ set: () => ({ where: async () => { invalidated = true; } }) }),
    };
    const route = await isolated("../app/api/auth/forgot-password/route.ts", {
      process: { env }, configuredEmailOrigin: branding.configuredEmailOrigin,
      readBoundedJsonObject: async () => ({ email: "student@example.test" }),
      and: () => true, eq: () => true, getDb: () => db,
      users: {}, passwordResetTokens: {}, checkRateLimit: async () => true,
      clientIp: () => "127.0.0.1", sameOriginRequest: () => true, validEmail: () => true,
      cleanText: value => String(value), jsonError: (message, status) => Response.json({ error: message }, { status }),
      createOpaqueToken: () => token, hashOpaqueToken: async () => "test_hash_0123456789abcdef",
      emailDeliveryConfigured: () => true,
      sendTransactionalEmail: async input => {
        branding.securityEmailVariables(input.security, {}, branding.configuredEmailOrigin(env), { allowLocalHttp: env.NODE_ENV === "development" });
        messages.push(input);
      },
    });
    const response = await route.POST(new Request("https://spoofed-host.invalid/api/auth/forgot-password", { method: "POST" }));
    assert.equal(response.status, 200);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].security.resetUrl, `${branding.configuredEmailOrigin(env)}/reset-password?token=${token}`);
    assert.equal(messages[0].text.includes("spoofed-host"), false);
    assert.equal(invalidated, false);
  }
});

test("only saved valid platform accounts appear, with safe URL attributes and no invented accounts", () => {
  const values = branding.securityEmailVariables(contentFor("verify-email"), {
    social_x: "https://x.com/official?first=one&second=two'quoted",
    social_instagram: "javascript:alert(1)", social_tiktok: "https://tiktok.com.evil.example/account",
    social_youtube: "https://user:secret@youtube.com/account", social_telegram: "http://t.me/test",
    social_facebook: "https://facebook.com:444/account", social_linkedin: "https://linkedin.com/ok\nattack",
  }, origin);
  const slots = Object.entries(values).filter(([key]) => /^SOCIAL_\d+$/.test(key)).map(([, value]) => value);
  assert.equal(slots.filter(Boolean).length, 1);
  assert.ok(slots[0].includes("&amp;second=two%27quoted"));
  assert.doesNotMatch(slots.join(""), /javascript:|evil\.example|user:secret|<script|onerror=/);
  const blank = branding.securityEmailVariables(contentFor("verify-email"), {}, origin);
  assert.equal(blank.SOCIAL_HEADING, "");
  assert.ok(Object.entries(blank).filter(([key]) => /^SOCIAL_\d+$/.test(key)).every(([, value]) => value === ""));
});

test("future channel labels are escaped in title and alt without allowing raw injected markup", async () => {
  const unsafeLabel = `test\"><img src=x onerror='bad'>&`;
  const renderer = await isolated("../lib/email-branding.ts", { normalizedSocialLinks: () => [{ id: "x", labelAr: unsafeLabel, url: "https://x.com/account?a=1&b=2" }] });
  const result = renderer.securityEmailVariables(contentFor("verify-email"), {}, origin).SOCIAL_1;
  assert.ok(result.includes(renderer.escapeEmailHtml(unsafeLabel)));
  assert.doesNotMatch(result, /<img src=x/);
  assert.equal((result.match(/<img /g) || []).length, 1);
  assert.ok(result.includes("?a=1&amp;b=2"));
});

test("renderer caches only template files and rereads added, changed and removed social settings for each message", async () => {
  const s = await setup();
  const first = await s.prepareSecurityEmail({ kind: "verify-email", code: "000001" });
  assert.doesNotMatch(first.html, /\/email-assets\/x\.png/);
  s.state.settings = { social_x: "https://x.com/first_account" };
  const second = await s.prepareSecurityEmail({ kind: "verify-email", code: "000002" });
  assert.ok(second.html.includes("https://x.com/first_account"));
  assert.ok(second.html.includes("000002"));
  assert.equal(second.html.includes("000001"), false);
  s.state.settings = { social_x: "https://x.com/updated_account" };
  const third = await s.prepareSecurityEmail({ kind: "verify-email", code: "000003" });
  assert.equal(third.html.includes("first_account"), false);
  assert.ok(third.html.includes("updated_account"));
  s.state.settings = {};
  const fourth = await s.prepareSecurityEmail({ kind: "verify-email", code: "000004" });
  assert.equal(fourth.html.includes("updated_account"), false);
  assert.equal(fourth.variables.SOCIAL_HEADING, "");
  assert.equal(fourth.variables.SOCIAL_1, "");
  assert.equal(s.calls.files.length, 1, "static template read once");
  assert.equal(s.calls.settings, 4, "public settings reread for every email");
});

test("default sender posts both the real branded HTML and plain-text fallback for all three security kinds", async () => {
  const s = await setup();
  for (const kind of kinds) await s.send(kind);
  assert.equal(s.calls.provider.length, 3);
  for (const call of s.calls.provider) {
    assert.equal(call.url, "https://api.resend.com/emails");
    assert.equal(call.options.method, "POST");
    assert.equal(call.options.headers["idempotency-key"], "isolated-delivery-1");
    assert.equal(call.options.headers.authorization, "Bearer isolated-provider-key-not-real");
    assert.ok(call.options.signal instanceof AbortSignal);
    assert.deepEqual(call.body.to, ["student@example.test"]);
    assert.equal(call.body.text, "نص احتياطي آمن: 012345");
    assert.match(call.body.html, /<!doctype html>/i);
    assert.equal(call.body.template, undefined);
  }
});

test("optional hosted IDs choose template-only payloads and include freshly saved account variables", async () => {
  const environment = Object.fromEntries(kinds.map(kind => [branding.EMAIL_TEMPLATE_ENV[kind], `meras-${kind}`]));
  const s = await setup({ environment, settings: { social_x: "https://x.com/current_account" } });
  for (const kind of kinds) {
    await s.send(kind);
    const body = s.calls.provider.at(-1).body;
    assert.equal(body.template.id, `meras-${kind}`);
    assert.ok(body.template.variables.SOCIAL_1.includes("current_account"));
    assert.equal(body.html, undefined); assert.equal(body.text, undefined);
  }
  s.state.settings = {};
  await s.send("verify-email");
  assert.equal(s.calls.provider.at(-1).body.template.variables.SOCIAL_1, "");
  assert.equal(s.calls.provider.at(-1).body.template.variables.SOCIAL_HEADING, "");
});

test("oversized safely escaped social variables fall back to direct HTML instead of exceeding hosted template limits", async () => {
  const s = await setup({ environment: { RESEND_TEMPLATE_VERIFY_EMAIL: "meras-verify-email" }, settings: { whatsapp_number: "0501234567", whatsapp_message: "مرحبا ".repeat(200) } });
  const prepared = await s.prepareSecurityEmail(contentFor("verify-email"));
  assert.ok(prepared.variables.SOCIAL_1.length > 2000);
  assert.equal(branding.canUseHostedEmailTemplate(prepared.variables), false);
  await s.send();
  const body = s.calls.provider[0].body;
  assert.equal(body.template, undefined);
  assert.ok(body.html.includes("https://wa.me/966501234567?text="));
  assert.ok(body.text);
  assert.equal(branding.canUseHostedEmailTemplate({ exact: "a".repeat(2000) }), true);
  assert.equal(branding.canUseHostedEmailTemplate({ tooLong: "a".repeat(2001) }), false);
  assert.equal(branding.canUseHostedEmailTemplate(Object.fromEntries(Array.from({ length: 51 }, (_, index) => [String(index), "a"]))), false);
});

test("delivery errors are sanitized for provider failures, malformed successes and invalid hosted identifiers", async () => {
  for (const delivery of [
    async () => { throw new Error("PRIVATE_ACCOUNT secret-key student@example.test 012345"); },
    async () => new Response("PRIVATE_ACCOUNT", { status: 429 }),
    async () => new Response("PRIVATE_ACCOUNT", { status: 200 }),
    async () => Response.json(null), async () => Response.json({}),
    async () => Response.json({ id: "" }), async () => Response.json({ id: 123 }),
  ]) {
    const s = await setup({ delivery });
    await assert.rejects(s.send(), error => error instanceof s.EmailDeliveryError && error.status === 503 && error.code === "EMAIL_DELIVERY_FAILED" && !/PRIVATE_ACCOUNT|secret-key|student@example|012345/.test(error.message));
    assert.equal(s.calls.provider.length, 1);
  }
  const invalid = await setup({ environment: { RESEND_TEMPLATE_VERIFY_EMAIL: "<malformed-template>" } });
  await assert.rejects(invalid.send(), error => error instanceof invalid.EmailDeliveryError);
  assert.equal(invalid.calls.provider.length, 0);
  const disabled = await setup({ environment: { RESEND_API_KEY: "" } });
  await assert.rejects(disabled.send(), error => error.code === "EMAIL_NOT_CONFIGURED");
  assert.equal(disabled.calls.provider.length, 0);
  assert.equal(disabled.calls.files.length, 0);
});

test("missing template variables fail closed and rendering substitutes once without executing account text", () => {
  assert.throws(() => branding.renderSecurityEmail("{{{MISSING}}}", {}), /Missing email template variable/);
  assert.equal(branding.renderSecurityEmail("<p>{{{CODE}}}</p>", { CODE: "012345" }), "<p>012345</p>");
  assert.equal(branding.renderSecurityEmail("{{{SOCIAL_1}}}", { SOCIAL_1: "{{{CODE}}}", CODE: "012345" }), "{{{CODE}}}");
});

test("Docker runtime and Next API tracing include each of the three real email template files", async () => {
  const docker = await readFile(join(root, "Dockerfile"), "utf8");
  assert.match(docker, /COPY --from=build \/app\/emails \.\/emails/);
  const config = (await isolated("../next.config.ts", { process: { env: {} } })).default;
  assert.ok(config.outputFileTracingIncludes["/api/**"].includes("./emails/resend/*.html"));
  for (const file of Object.values(branding.EMAIL_TEMPLATE_FILES)) {
    assert.match(file, /^0[1-3]-.+\.html$/);
    assert.match(await readFile(join(root, "emails", "resend", file), "utf8"), /<!doctype html>/i);
  }
});
