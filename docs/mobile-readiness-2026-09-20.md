# Mobile readiness audit — 20 September 2026

## Completed changes

- Removed the RevenueCat client SDK, configuration keys, purchase/restore UI and active purchase requests. Historical store receipts remain readable and existing server entitlements are preserved.
- Production iOS/Android builds default to consumption-only (`reader`). Direct website checkout is confined to explicit internal distribution builds. Stale `iap` or unsafe store build configuration fails closed.
- Removed reader-mode course/AI prices and purchase links, including links injected through announcements, assistant actions and notifications. Android uses non-clickable website subscription guidance; iOS displays existing-access guidance.
- Added a native privacy/terms reader backed by the exact shared published website sections and current public organization settings. Registration, footer and account screens expose it without linking store users into a website checkout.
- Added independent instructor registration, email-verification routing, country/qualification/work-mode profile, camera selfie and private identity/CV/certificate attachments, review status, bank information, registered-device and MFA access. Mutations carry server revisions; uploads abort on unmount and cannot cross a changed account session. Private picker cache files are cleaned after upload/cancellation.
- Added bilingual contract reading, explicit consent with password reauthentication, a bounded native signature pad, and authenticated PDF download. The server controls offering/signature status and immutable content hashes.
- On iOS, Google login is hidden if Apple login is unavailable, to avoid offering a social login without its equivalent privacy-preserving option.

## Verification evidence

Before instructor screens were added, mobile TypeScript and ESLint passed, all 96 mobile tests passed, and production-reader Android and iOS JavaScript exports completed successfully. Final instructor/deletion/assignment results are recorded below when completed. A JavaScript export is not a signed native binary or physical-device acceptance test.

## Store submission requirements remaining outside repository-only checks

The app cannot be guaranteed approval on first submission. The operator must supply valid Apple/Google developer accounts, signing/provisioning, working configured Apple/Google login, review credentials, accurate privacy/data-safety disclosures, screenshot/age-rating content and a tested release binary. Sign in with Apple account deletion must revoke the associated Apple token. Account deletion needs an accessible web request path in Play Console metadata. Existing store subscriptions, if any, may require cancellation instructions outside this app after RevenueCat removal.

Apple reader-app eligibility and any external-link entitlement must be approved by Apple for this app. Video learning plus paid AI functions may affect classification. Do not enable external checkout for public Saudi store builds based only on a website subscription preference. Program eligibility, regional terms and store approval must be checked for any later external-link release.

Private instructor identity collection must remain disabled until the operator supplies a lawful purpose/basis, retention period and secure storage/scanning configuration. Camera capture is a photograph, not a biometric liveness verification. Employment/contract wording requires the operator's legal review.

## Official policy and implementation references

- Apple reader apps: https://developer.apple.com/support/reader-apps/
- Apple review guidelines (3.1.3, 4.8, 5.1.1): https://developer.apple.com/app-store/review/guidelines/
- Apple account deletion: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Google consumption-only billing FAQ: https://support.google.com/googleplay/android-developer/answer/10281818?hl=en
- Google payments policy: https://support.google.com/googleplay/android-developer/answer/9858738?hl=en
- Google deletion requirements: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en
- Expo camera picker: https://docs.expo.dev/versions/latest/sdk/imagepicker/

No production students, purchases or files were changed during this mobile audit.
