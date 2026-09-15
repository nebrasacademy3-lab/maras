# Plan v7 implementation status

This implementation branch is not a production deployment. The earlier unuploaded local working tree is currently inaccessible; it has not been represented as recovered or published. Changes here are built from the verified repository base.

## Current device-access change

- Separate ending sessions from revoking enrollment.
- Explicit blocked, allowed-return, approval-required and bounded temporary-ban states.
- Allow-return never creates a session or enrollment; fresh authentication, MFA and the two-device limit are still checked by createSession.
- Legacy revoked devices remain blocked by migration defaults.
- Ended sessions and push registrations are never restored.
- New administrative operations use optimistic revisions, per-student database locking, a recorded reason and administrative MFA.
- Device view/manage grants are independent from editing a student's basic profile. Existing supervisors receive no automatic new grants.
- Web and native controls use the same policy vocabulary. Hidden controls do not fetch device records without the required permission.

## Verification gates

The base passed 475 web tests, 70 native tests, 18 isolated security integrations and 7 study integrations. These are baseline results, not evidence for new changes. The base browser suite failed a canonical URL assertion; diagnostic output is being reviewed without removing that assertion.

The new device code requires the generated Drizzle migration before it can run. A branch-limited temporary materializer applies the reviewed schema/capability wiring and generates matching SQL/snapshot files, then removes itself. No production database or provider credentials are accessed.

Before deployment: all typechecks, lint, unit tests, isolated PostgreSQL integrations and browser checks must pass on the final commit. No claim is made that the full 192-case plan, provider quotas/budgets, identity migration, all device models or load targets are complete.
