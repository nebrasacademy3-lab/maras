# Public agent discovery — 2026-09-23

## Official status and sources

- [WebMCP Draft Community Group Report, 17 September 2026](https://webmachinelearning.github.io/webmcp/) explicitly says it is not a W3C Standard and is not on the W3C Standards Track. Its current imperative entry point is `document.modelContext`. Browser implementations and the draft can change.
- [Chrome's WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp) describes an origin trial from Chrome 149 and a local testing flag, origin isolation, and the `tools` Permissions Policy. This implementation does not enable an origin trial, install a polyfill, loosen CSP, or grant cross-origin execution.
- [Chrome's declarative API documentation](https://developer.chrome.com/docs/ai/webmcp/declarative-api) defines `toolname`, `tooldescription`, and `toolparamdescription`. Without `toolautosubmit`, the user completes submission. These are progressive annotations on an existing form; unsupported browsers keep ordinary HTML search behavior.
- [AI Catalog](https://ai-catalog.io/spec/) is a draft. Its 1.0 container permits an empty `entries` array. A catalog is discovery metadata, not an authorization mechanism or a promise that an agent is safe.
- [ARD v0.91, 26 August 2026](https://github.com/ards-project/ard-spec/blob/b76f235a8f461876ad4f1e77abd0eb0eb302b48d/spec/ard.md) is a proposal. The current required consumer discovery path is `/.well-known/ard.json` and relation `ard`; the older well-known `ai-catalog.json` path is an optional fallback. ARD has a separate authoritative `ArdManifest` definition, which accepts an `entries` array and transport-defined top-level fields.

## Implemented scope

`/ai-catalog.json` and `/.well-known/ard.json` share one small public manifest with the platform name, public about/logo URLs, and empty entries. This is intentional: Meras's account-bound AI tools are not published MCP or A2A services. Inventing protocol metadata for them would misrepresent their contract. The manifest does not advertise private endpoints, student files, tokens, database identifiers, payment actions, or unverifiable trust/certification claims. Public URLs use the existing configured-origin policy, never the request Host or forwarding headers.

Both routes honor `searchIndexingEnabled()`. Development, explicitly disabled QA/staging, and nonpublic/unconfigured production origins return 404, `no-store`, and `X-Robots-Tag: noindex, nofollow`. Enabled public responses use `application/ai-catalog+json`, `nosniff`, and a five-minute cache. They have no database reads, provider calls, or account state. The response includes discovery Link headers; the root layout also includes discovery head links under the same indexing policy.

Only the existing homepage search form is annotated. It retains `GET /courses?q=...`, its visible submit control and accessible combobox behavior, with a 160-character input bound. No automatic submission, imperative tool registration, new credentials, or sensitive forms were added. A browser still needs experimental WebMCP support to interpret the annotations; functional WebMCP execution was not claimed from SSR tests.

## Validation evidence

- Five Node tests cover exact public payload/no secret propagation, production versus development/QA discovery controls, runtime policy changes, pinned schema integrity/shared ARD route, and rendering the actual React search form with declarative attributes and no autosubmit.
- The actual production-route response was validated with isolated Ajv 8.17.1 / ajv-formats 3.0.1, Draft 2020-12, against both official schemas. Malformed `entries` and entries containing both `url` and `data` were rejected. The validator is local QA tooling only; package manifests and lockfiles were not changed.
- Unmodified official schema fixtures and their Apache-2.0 license are under `tests/fixtures/agent-discovery`. Both are pinned to upstream commit `b76f235a8f461876ad4f1e77abd0eb0eb302b48d`, with SHA-256 hashes recorded in the fixture README.
- This is a minimal publisher manifest, not a federated ARD search registry, verified trust identity, general-purpose MCP server, or promise of search ranking/agent adoption. Adding callable artifacts later requires a real protocol document and a separate authorization/security review.
