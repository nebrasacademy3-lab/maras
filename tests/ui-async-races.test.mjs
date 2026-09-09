import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const settle = () => new Promise(resolve => setTimeout(resolve, 15));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function all(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...(tree.children?.flat(Infinity) || []).flatMap(child => all(child, predicate))];
}
const first = (tree, predicate) => { const node = all(tree, predicate)[0]; assert.ok(node, "expected control is rendered"); return node; };
function content(tree) { return typeof tree === "string" ? tree : typeof tree === "number" ? String(tree) : tree?.children?.flat(Infinity).map(content).join(" ") || ""; }

async function harness(file, name, props, overrides = {}) {
  const state = [], refs = [], effects = [], cleanups = [];
  let stateIndex = 0, refIndex = 0, mounted = false;
  const icons = Object.fromEntries("Laptop RefreshCw ShieldCheck Smartphone Download FileText ImageIcon LoaderCircle Mic Paperclip Reply Send ShieldAlert Square Star X Bot Check Copy Gift Share2 Sparkles TicketPercent Trophy UsersRound".split(" ").map(name => [name, name]));
  const dependencies = {
    ...icons,
    useState: initial => { const index = stateIndex++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
    useRef: initial => { const index = refIndex++; refs[index] ||= { current: initial }; return refs[index]; },
    useEffect: effect => { if (!mounted) effects.push(effect); }, useMemo: factory => factory(), useCallback: callback => callback,
    useRealtimeSync: () => undefined, styles: new Proxy({}, { get: (_target, name) => name }), Link: "a", AdminMfaNotice: "mfa", isAdminStepUpResponse: () => false,
    React: { createElement: (type, properties, ...children) => ({ type, props: properties || {}, children }), Fragment: "fragment" },
    window: { setTimeout, clearTimeout, matchMedia: () => ({ matches: false }) },
    uploadProgressLabel: () => "Uploading", ...overrides,
  };
  const key = "__uiRace" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    const input = "const {" + Object.keys(dependencies).join(",") + "}=globalThis[" + JSON.stringify(key) + "];\n" + source.replace(/^import .+;\r?\n/gm, "");
    const loaded = await import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText).toString("base64"));
    return {
      state,
      boundary: next => loaded[name](next || props),
      render: () => { stateIndex = 0; refIndex = 0; const tree = loaded[name](props); return typeof tree.type === "function" ? tree.type(tree.props) : tree; },
      mount: () => { mounted = true; for (const effect of effects.splice(0)) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); } },
      unmount: () => { for (const cleanup of cleanups.splice(0)) cleanup(); },
    };
  } finally { delete globalThis[key]; }
}

const ticket = { id: 51, status: "open", replies: [] };
test("closing the same support ticket remounts its composer and cancels pending microphone ownership", async () => {
  let signal, disposed = 0;
  const h = await harness("../components/support-chat.tsx", "SupportChatThread", { ticket, onReload() {} }, { startVoiceRecording: async input => { signal = input.signal; return { dispose: () => { disposed++; }, stop() {} }; } });
  const openBoundary = h.boundary(); const closedBoundary = h.boundary({ ticket: { ...ticket, status: "closed" }, onReload() {} });
  assert.notEqual(openBoundary.props.key, closedBoundary.props.key, "same-ticket close must invalidate the recording owner");
  h.render(); h.mount();
  first(h.render(), node => node.props["aria-label"] === "تسجيل صوتي").props.onClick();
  await settle(); assert.equal(signal.aborted, false);
  h.unmount(); assert.equal(signal.aborted, true); assert.equal(disposed, 1);
  assert.notEqual(openBoundary.props.key, h.boundary({ ticket: { ...ticket, id: 52 }, onReload() {} }).props.key);
});

test("pending support upload protects text, files and removal controls and preserves draft after failure", async () => {
  const upload = deferred();
  const h = await harness("../components/support-chat.tsx", "SupportChatThread", { ticket, onReload() {} }, { uploadWithProgress: () => upload.promise });
  h.render(); h.mount();
  first(h.render(), node => node.type === "textarea").props.onChange({ target: { value: "Retain this message" } });
  first(h.render(), node => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [new File(["test"], "note.txt")] } });
  first(h.render(), node => node.props["aria-label"] === "إرسال الرسالة").props.onClick();
  const pending = h.render();
  assert.equal(first(pending, node => node.type === "textarea").props.disabled, true);
  assert.equal(first(pending, node => node.type === "input" && node.props.type === "file").props.disabled, true);
  const files = first(pending, node => node.props.className === "support-chat-selected-files");
  assert.equal(first(files, node => node.type === "button").props.disabled, true);
  upload.reject(new Error("synthetic offline")); await settle();
  const failed = h.render();
  assert.equal(first(failed, node => node.type === "textarea").props.value, "Retain this message");
  assert.equal(first(failed, node => node.type === "textarea").props.disabled, false);
  assert.match(content(failed), /note\.txt/); h.unmount();
});

const referral = { program: { enabled: true, title: "Test" }, referral: { code: "TEST", shareUrl: "https://example.test/join", counts: { qualified: 0, total: 0, pending: 0, rejected: 0 }, progressPercent: 0, nextTier: null }, tiers: [], referrals: [], rewards: [], coupons: [] };
test("successful sharing releases UI before tracking finishes and aborts tracking on navigation", async () => {
  const tracking = deferred(); let trackedSignal, getCalls = 0;
  const h = await harness("../components/referrals-center.tsx", "ReferralsCenter", {}, {
    shareBrowserLink: async () => "shared", copyBrowserText: async () => true,
    fetch: async (_url, init) => { if (init.method === "POST") { trackedSignal = init.signal; return tracking.promise; } getCalls++; return Response.json(referral); },
  });
  h.render(); h.mount(); await settle();
  first(h.render(), node => node.type === "button" && content(node).includes("مشاركة الرابط")).props.onClick();
  await settle();
  assert.equal(first(h.render(), node => node.type === "button" && content(node).includes("مشاركة الرابط")).props.disabled, false);
  assert.equal(trackedSignal.aborted, false); assert.match(content(h.render()), /تمت مشاركة رابطك/);
  h.unmount(); assert.equal(trackedSignal.aborted, true);
  tracking.resolve(Response.json({ ok: true })); await settle(); assert.equal(getCalls, 1, "tracking cannot start another load after navigation");
});

test("cancelled sharing sends no tracking request or false success", async () => {
  let tracked = 0;
  const h = await harness("../components/referrals-center.tsx", "ReferralsCenter", {}, { shareBrowserLink: async () => "cancelled", copyBrowserText: async () => assert.fail("cancellation must not copy"), fetch: async (_url, init) => { if (init.method === "POST") tracked++; return Response.json(referral); } });
  h.render(); h.mount(); await settle();
  first(h.render(), node => node.type === "button" && content(node).includes("مشاركة الرابط")).props.onClick(); await settle();
  assert.equal(tracked, 0); assert.doesNotMatch(content(h.render()), /تمت مشاركة رابطك/); h.unmount();
});

test("device refresh ignores delayed older responses and email changes remount private state", async () => {
  const requests = [];
  const h = await harness("../components/admin-registered-devices.tsx", "AdminRegisteredDevices", { email: "first@example.test" }, { fetch: (_url, init) => { const pending = deferred(); requests.push({ ...pending, signal: init.signal }); return pending.promise; } });
  const firstBoundary = h.boundary();
  assert.notEqual(firstBoundary.props.key, h.boundary({ email: "second@example.test" }).props.key);
  h.render(); h.mount(); await settle();
  first(h.render(), node => node.props["aria-label"] === "تحديث الأجهزة المعتمدة").props.onClick();
  assert.equal(requests.length, 2); assert.equal(requests[0].signal.aborted, true);
  const device = { id: 7, deviceLabel: "Fresh revoked device", platform: "ios", firstSeenAt: "2026-09-09", lastSeenAt: "2026-09-09", revokedAt: "2026-09-09", revocationReason: "replacement" };
  requests[1].resolve(Response.json({ registeredDevices: [device] })); await settle();
  requests[0].resolve(Response.json({ registeredDevices: [{ ...device, deviceLabel: "Stale active device", revokedAt: null }] })); await settle();
  const tree = h.render(); assert.match(content(tree), /Fresh revoked device/); assert.doesNotMatch(content(tree), /Stale active device/);
  h.unmount(); assert.equal(requests[1].signal.aborted, true);
});
