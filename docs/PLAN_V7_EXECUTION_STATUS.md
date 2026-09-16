# Plan v7: device security and native compatibility delivery

## Scope and evidence boundaries

This document describes the code delivered in PR #3, not completion of the entire 192-case v7 plan. A Git commit or a green JavaScript bundle is not proof of production deployment or a signed App Store / Google Play release. The final PR checks, merged commit and Railway deployment records are the source of truth for release status.

The earlier unuploaded local working tree was not accessible during this implementation. No claim is made that it was recovered. Work here starts from the verified repository base and preserves the existing platform.

## Implemented source

- Device administration distinguishes ending current sessions from revoking device enrollment. Separate actions support blocked return, allowed fresh return, approval-required return and bounded temporary bans.
- Allowed return never creates a session, restores an old session or bypasses MFA or the two-device enrollment limit. Temporary expiry permits fresh authentication only.
- Revoked legacy devices remain blocked through the migration default. Session and push credentials are never resurrected.
- Mutations require a finite explicit device-management capability, a documented reason, administrative step-up, account locking and the expected record revision. Cross-account device IDs and stale revisions are rejected.
- Device viewing and management are independent from editing student profile data. No existing supervisor receives the new capabilities automatically. Legacy student-profile responses also redact session/device fields without the device-view capability.
- Web and native controls share the same policy. Hidden sections do not fetch unauthorized device records; read-only staff have no mutation controls. Confirmation cancellation sends no mutation. Account changes discard private state.
- Native mutations cancel older reads for the exact acting-account/student cache key before writing, reject callbacks from unmounted screens, and prevent duplicate confirmation submissions. A failed summary refresh is not reported as a failed already-applied mutation.
- Expo stays on SDK 57, with compatible patch dependencies and a regenerated lockfile. Dynamic native configuration explicitly includes expo-image, expo-localization, expo-sharing and expo-web-browser.
- The staff page has a semantic primary heading. Staff browser tests await the actual authorized transaction response and the closed editor rather than a temporarily renamed busy button.
- Public-content fields have stable accessible names, with their changing character counts exposed as separate descriptions. The browser's exact-name assertion remains enabled.
- CI verifies selected committed source hashes before and after tests, checks byte-identical shared contracts, and retains only bounded non-secret QA evidence. Temporary source-editing workflows were removed.

## Verified checkpoint and final rerun

At commit `027d793293fe34dddc7d55dcf0eafcb075c9b45a`:

- Quality run `35042914026`: web production build and lint passed; 474 web tests passed with zero failures or skips.
- The same run passed 7 isolated study integrations, 18 security integrations, 11 device-policy integrations and 4 study-browser checks. All used disposable loopback PostgreSQL and synthetic provider behavior, not customer data or live payment/AI requests.
- Mobile typechecking, lint and behavioral tests passed.
- Mobile release validation run `35042914002`: both Android and iOS passed Expo dependency compatibility, TypeScript, native configuration generation and production JavaScript/assets export.
- The full platform-browser job then exposed a public-content field's changing accessible name. That component was fixed, with an additional regression test. Final CI must run again on the resulting commit; the checkpoint above must not be used to represent a complete final browser pass.

Check the current PR #3 checks for the latest final results. Browser viewport emulation is not a physical-device test. The study video fixture checks metadata/UI only, not genuine protected-video playback.

## Database rollout

`drizzle/0033_device_return_policy.sql` adds the return policy, optional block deadline and nonnegative policy version with database constraints. The matching generated snapshot and journal are committed. This migration is additive and does not delete device records. The migration must complete before the new device API handles requests. Keep database backups and the previous application deployment available; do not drop new columns as a casual rollback.

After deployment, the platform owner must explicitly grant `students.devices.view` or `students.devices.manage` to appropriate supervisors. Management covers viewing through the existing finite permission policy.

## External configuration and remaining release gates

A read-only Railway service-configuration check on 2026-09-16 showed no RevenueCat server configuration variables. The current source requires `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_PROJECT_ID`, `REVENUECAT_ENVIRONMENT` and `REVENUECAT_APP_IDS`, plus the separately authenticated webhook configuration, native public SDK keys and correct store-product mappings. Until genuine account configuration is supplied and purchase/restore/refund flows are tested, native in-app purchases are not certified operational. Never substitute invented keys or bypass receipt validation.

The Resend domain `marasalelm.com` was verified for sending at the same checkpoint. That does not prove end-to-end email delivery; no live OTP or customer email was sent during these tests.

No signed APK/AAB/IPA, physical Android/iOS execution or store submission is claimed here. Store credentials, signing, real push delivery, deep links and protected-media playback still require end-to-end release testing. The native validation workflow deliberately exports only non-secret metadata as evidence, not a distributable app.

The wider v7 plan still requires its remaining identity, administration/architecture, AI budget/quota, large-file, performance/load and full feature-parity acceptance work. Do not mark the whole plan complete from this scoped release. No claim of absolute immunity to vulnerabilities is made.

## Administrative unification and public identity continuation — 2026-09-16

The continuation adds one capability-filtered eight-group navigation contract for the web and native administration. Legacy deep links are retained. The old secondary all-center navigation is removed. A real course-roster index replaces its formerly missing destination. Native administration adds concrete search/SEO, scan queue, partner, store-purchase and audit screens against existing server endpoints, and separates content, settings, notifications, orders and coupons into their canonical destinations.

Unassigned student-profile tabs, operational summaries and mutation controls are hidden, including financial exports and delete actions. Newly scoped console clients request only the relevant data sets; old clients retain a compatible shape, with capability redaction still enforced. Request and support child-file queries are constrained to the actual parent page rather than unrelated most-recent records. Native caches are actor-bound for changed workflows; account changes remount the administration. Web MFA retries carry the original actor ID so a different session cannot execute a retained old form.

Partner creation/update/delete now requires server capabilities, mutation MFA, bounded bodies and safe public HTTPS URLs. Publication requires an explicit rights reference and attestation. Updates/deletes require the current record version and recheck under a database row lock. New uploaded objects are cleaned on rejected writes, and previous objects are removed only after a successful commit. No live partner, payment or production identity was changed during implementation.

Visible public identity, Organization/WebSite identifiers and AboutPage data now share the official Arabic name, domain, public naming variant and clear limitations. The optional public directory refers to the same entity. These changes do not prove indexing, ranking or inclusion in any AI system. The assistant did not claim academic accreditation or fabricate legal identifiers, reviews or affiliations.

This is a defined implementation increment, not completion of the 192-case plan. The earlier unpublished identity rewrite, Gemini paid-fallback ledger, large-file pipeline and lesson teacher/quiz/PDF expansion were not present in this baseline and are not represented as recovered or deployed here. Current test/build and visual results must be taken from this increment's actual CI run. Broader identity, AI-budget, study-tool, performance/load and signed-device release work remain acceptance gates.


## Latest verified checkpoint — 2026-09-16

The branch head is `0a29b982779b91475e9256ba06765a4fb5d247a1`. The final GitHub Actions runs for this head completed successfully:

- Quality gates run `35157455412`: web lint and production build passed; **520/520 web tests** passed; isolated database/security/device/admin/study integrations passed; Chromium, Firefox and WebKit browser checks passed with no client exceptions.
- Mobile release validation run `35157455228`: Android and iOS passed Expo dependency compatibility, TypeScript, native configuration generation and JavaScript/assets export.
- `expo-build-properties` is now aligned at `~57.0.20` in both `mobile/package.json` and the lockfile.
- Public readiness now waits only for required public initialization responses. Optional background analytics and account probes cannot create a false timeout, while protected/admin requests remain covered by their dedicated checks.

This checkpoint verifies the committed source on CI. It still does not claim signed store binaries, physical-device execution, production payment/RevenueCat configuration, live Resend delivery, live Gemini requests, load testing for thousands of users, or completion of the wider 192-case plan described above.
