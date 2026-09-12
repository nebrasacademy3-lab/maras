# Search and AI discovery

Public discovery now includes /about, /tools, /faq, /bundles and each active published bundle. Course, university and specialty pages retain their existing canonical URLs. Private accounts, learning workspaces, payment screens and administration remain authorized and noindex.

## Administration

Open /admin/seo from the administration navigation. The report lists current public pages with search, pagination, canonical preview, duplicate-title notices, indexing eligibility and optional Google/Bing verification indicators.

A session administrator can edit plain-text titles (100 characters) and descriptions (180 characters). Empty fields restore the live catalog defaults. Changes are stored in the existing platform_settings table under category seo_metadata, audited transactionally, and protected against concurrent overwrites. Administrators cannot inject HTML/scripts, change canonical origins or make a private page indexable through this editor.

The metadata editor is not a substitute for maintaining accurate visible content. Search engines may choose different titles or snippets. Readiness indicators are configuration checks, not a claim that an external engine has indexed a URL.

## Production configuration

- Set NEXT_PUBLIC_SITE_URL to the real HTTPS canonical origin. APP_URL may be used as the fallback origin.
- Production indexing requires NODE_ENV=production, a valid HTTPS canonical origin and SEO_INDEXING_ENABLED not set to false. Keep non-production deployments disabled.
- GOOGLE_SITE_VERIFICATION accepts a Google verification token. BING_SITE_VERIFICATION accepts the 32-character hexadecimal Bing token. DNS ownership verification is also valid and may not appear in these metadata indicators.
- Confirm public Googlebot, Bingbot, OAI-SearchBot and PerplexityBot access in hosting/CDN logs. A User-Agent string alone is not trusted for access control. Apply provider IP verification if a WAF exception is necessary.
- Existing wildcard robots policy and training-crawler choices are preserved. Search crawling and model-training permissions are separate. Authentication and authorization protect private content regardless of robots directives.

The root Organization structured data uses actual published legal name, description and normalized social links when available. It does not invent accreditations, ratings or business credentials. FAQ structured data matches the visible answers. Bundle lists and detail pages use the actual eligible bundle quote and linked course membership.

## Optional IndexNow queue

IndexNow is disabled by default. To enable it on the real production origin:

1. Set INDEXNOW_ENABLED=true and INDEXNOW_KEY to an 8–128 character key containing only letters, digits and hyphens. The public verification response is served at /indexnow.txt only while enabled.
2. Confirm /indexnow.txt and public content are reachable at the canonical host.
3. Committed catalog and bundle edits enqueue affected canonical URLs. Metadata edits enqueue their page. Each queued URL is stored privately in platform_settings category seo_indexnow.
4. Dispatch manually from /admin/seo after administrative step-up, or invoke dispatchSeoIndexNow from a scheduler. Each run sends at most 100 due URLs. Multiple workers coordinate through a PostgreSQL advisory lock.
5. enqueuePublicSeoUrls(paths) only writes the local queue; it never sends HTTP. The dispatcher posts to the fixed https://api.indexnow.org/indexnow endpoint with an eight-second timeout, disallows redirects and retries failures with bounded exponential backoff. HTTP 200/202 means the notification was accepted, not that indexing is guaranteed.

Direct database changes or independent publishing systems must call enqueuePublicSeoUrls after successful commit (max 1000 paths per call). Include an old public URL when a page is renamed or removed. Bulk changes must be batched. Scheduled visibility changes remain discoverable through the live sitemap; integrate the queue into any dedicated publication scheduler if faster notification is needed.

## Verification performed locally

Behavior tests cover public bundle membership, hidden/private URLs, safe overrides, conflict rejection, role and origin checks, body limits, actual server-rendered FAQ/bundle content, structured identity, disabled IndexNow, queue deduplication and dispatch success/retry without using a real external service.

Run:

    node --test tests/seo-behavior.test.mjs tests/seo-discovery-behavior.test.mjs tests/assistant-seo-behavior.test.mjs

Synthetic browser helpers use only a loopback maras_qa database:
- scripts/qa-seed.mjs writes random QA account/session secrets to ignored .data files.
- scripts/qa-web.mjs starts local dev/production on port 3100 and disables external payment/email/IndexNow credentials.
- Fixtures include readiness metadata for two courses, not a real playable video. Do not report video-playback verification from these fixtures.

## External discovery measurements

After production deployment and account access, inspect Search Console ownership, Search generative AI inclusion and its impressions report; review Bing Webmaster Tools AI Performance citations. Measure actual referral/conversion data separately from technical readiness.

Official references:
- Google AI search: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- Google participation control: https://support.google.com/webmasters/answer/16908024
- Google AI impressions report: https://support.google.com/webmasters/answer/16984139
- Bing AI Performance: https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview
- OpenAI crawlers: https://platform.openai.com/docs/bots
- Perplexity crawlers: https://docs.perplexity.ai/docs/resources/perplexity-crawlers

Google states that it ignores llms.txt for search visibility. No such file, structured-data label, automated content volume or Lighthouse score can ensure that every AI system knows or recommends a site. The deliverable improves accurate public discovery and provides measurable controls; external ranking and recommendation outcomes remain determined by the provider.

## Deterministic metadata in the initial document

The final production configuration disables streamed metadata for every request using the documented Next.js htmlLimitedBots: /.*/ setting. Browser checks found descriptions sometimes remained in the body even after ten seconds, which made head-only consumers miss them. The fix delivers titles, canonical links and descriptions in the initial head for all user agents; it does not target audit tools.

This delays initial streaming until generateMetadata resolves. Keep metadata lookups short and measure production response times with the real database and hosting. Local diagnostic timings during parallel tests are not a performance benchmark.

The current release evidence is in verification/seo-report.md, verification/seo-http.json, verification/seo-sitemap-crawl.json, verification/seo-browser-report.json, verification/lighthouse-seo.json and verification/current-screenshots. To repeat the local production checks after qa:database and qa:seed: run scripts/qa-build.mjs, start scripts/qa-web.mjs production, then scripts/qa-seo-http.mjs, scripts/qa-seo-sitemap.mjs and scripts/qa-lighthouse.mjs. The browser binary path in the Lighthouse helper is the local Windows Edge path; adapt it for another test host.
