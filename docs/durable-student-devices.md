# Durable student devices

A student account can enroll two browser or app installation identities. Enrollment is stored in `auth_devices`, independently of login sessions. Logout, session expiry, password recovery, password changes and the student's session-revocation action do not free either slot. A previously enrolled identity can sign in again. Staff accounts retain their existing exemption.

The shared `createSession` path checks enrollment under the account's PostgreSQL advisory transaction lock. Password login, registration, mobile login/registration and OAuth token exchange all use this path. Student session resolution also requires a currently approved enrollment, preventing old unapproved sessions from surviving the policy change.

Web identity uses a random persistent identifier and a separate HttpOnly cookie. Existing browser local-storage identifiers are adopted before login. Social login prepares the cookie before navigation, and its bound OAuth state preserves the selected identity through Apple's cross-site POST callback. Native apps use their existing SecureStore installation identity. Browser storage and installation identity are not hardware attestation: copying an identity, restoring device data, deleting storage or reinstalling can change or duplicate the apparent installation. This implementation cannot guarantee an uncloneable physical device or recover history already deleted from the database.

## Deployment and historical records

Apply `0028_durable_student_devices.sql` before starting the new authentication code. The repository's Railway start script runs migrations before starting Next when `RUN_DB_MIGRATIONS` is enabled. Without the new table, student session resolution fails closed.

The migration enrolls the earliest two distinct credible device identifiers still present in retained session history, including expired and logged-out sessions. It excludes old `fallback-` identifiers derived from user-agent text because those cannot distinguish physical devices. It revokes student sessions and push registrations that do not match either enrolled identity. Students whose old identifiers were unavailable or ambiguous must sign in to establish their identities; records deleted before this migration cannot be reconstructed. Inspect retained history and communicate the session refresh before deployment. The migration was generated and reviewed locally; no production migration or account action was executed in this task.

## Administrative replacement

`GET /api/admin/students/[email]/devices` returns `registeredDevices` and `deviceLimit: 2`. Records include registration ID, device label, platform, first/last login timestamps and revocation metadata. Raw installation identifiers are omitted. The list includes revoked records so the reason remains visible.

`DELETE` on the same endpoint accepts `{ "deviceId": <registration ID>, "reason": "clear explanation" }`. It requires an administrator session, additional MFA verification, origin validation or the native authenticated flow, and rate limiting. The transaction locks the account, checks the record's owner, revokes that enrollment and its sessions/push registration, and writes the actor and reason to the audit log. Repeated deletion is idempotent. The revoked identity remains tombstoned and cannot self-enroll again; a new identity can use the freed slot. Student session controls never invoke this operation.

`GET /api/profile/sessions` adds active `registeredDevices` with a `current` flag and `deviceLimit: 2`, alongside the existing session list. Administration's `deviceCount` now counts approved enrollments. The older editable `max_student_devices` setting no longer raises the limit.

## Local verification

Behavior tests cover logged-out/expired/revoked-session persistence, approved-device reentry, three concurrent registrations accepting two, repeated same-device login, staff exemption, persistent browser cookies versus identical user agents, authorized replacement and audit logging, ownership/MFA failures, and student session revocation. OAuth tests cover Apple POST with the OAuth binding cookie but no browser identity cookie, propagation of the state identity, private device cookies, and a mobile exchange rejected at the device boundary. Database behavior is exercised with deterministic in-memory transaction/lock fixtures; this does not replace a staging test against PostgreSQL and actual iOS/Android devices.
