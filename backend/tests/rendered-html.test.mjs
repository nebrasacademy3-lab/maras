import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

// The production bundle targets workerd and imports Cloudflare's virtual
// `cloudflare:workers` module. Map that runtime-only module to a harmless stub
// so this smoke test can import the worker under Node as well.
register("./cloudflare-loader.mjs", import.meta.url);

test("renders the Arabic platform shell and production metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /<html(?=[^>]*\blang=["']ar["'])(?=[^>]*\bdir=["']rtl["'])[^>]*>/i);
  assert.match(html, /<title>مراس العلم \| شرح جامعتك في مكان واحد<\/title>/i);
  assert.match(html, /<meta[^>]+name=["']description["'][^>]+content=["'][^"']*منصة تعليم جامعي سعودية/i);
});
