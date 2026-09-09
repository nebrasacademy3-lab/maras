# Fresh server business review — 2026-09-09

This review used the current source and new behavioral checks rather than relying on the prior review report. It was bounded and does not establish that every service or every possible vulnerability has been tested.

## Concrete fixes

- Student course-request file download/list endpoints now require the owner or administrator. An unrelated supervisor can no longer bypass the separate, scoped supervisor-download endpoint. Fractional, negative and unsafe IDs are rejected.
- Verified late charge callbacks cannot revert paid/review/refunded states to earlier statuses. A repeated captured event cannot turn a partial refund back into a paid order.
- AI subscription renewal now serializes the per-account expiry calculation in addition to each order, so two concurrent paid orders add consecutive months.
- Confirmed AI refund objects accumulate in integer minor units once per provider refund ID. Multiple partial refunds can correctly complete a full refund; replay cannot downgrade it. Over-total refunds are rejected.
- Paid order fulfillment preserves an administrator's suspension/revocation on the same order when the provider replays a payment notification.
- Payment amount matching rejects ambiguous sub-halala values. Refund helpers reject malformed/coercion-hostile JSON safely.
- Durable two-device enrollment was implemented after the explicit additional user request. See `durable-student-devices.md` for deployment and device-identity limits.

## Inspected service boundaries

Read current charge/refund webhook flow, course and AI checkout initiation/status, shared fulfillment/refund logic, referral registration/qualification/reward reconciliation, administrator referral/refund/finance controls, profile/session/password/reset routes, supervisor request/file routes, course-resource authorization/downloads, course-request attachment routes, sync authorization, and shared authentication/OAuth/session creation. The later durable-device requirement became the priority. Existing finance/refund/governance checks were primarily source contracts around webhook transitions; the new tests execute actual transition functions with a stateful database/provider fixture to expose replay, concurrency and ownership failures. Checkout's late-create-response race was handed to the auth/email agent, who implemented and checked the corresponding guards independently.

The six original new regression scenarios all failed before their fixes and then passed. Expanded checks now cover seven business scenarios plus eight device scenarios and sixteen OAuth scenarios (31 passed). Targeted finance/refund checks also passed; a concurrent mobile localization source-contract mismatch was reported to the owning agent instead of reverting its translated UI.

No live charge, refund, email, account mutation, migration or external service write was performed. Provider end-to-end behavior, migrated PostgreSQL transactions, real device storage, production configuration and delivery integrations still require controlled staging verification. Ranking, complete vulnerability absence and physical hardware identity cannot be guaranteed by these checks.

An initial broad multi-file payment patch was rejected by automatic approval review as too broad for the perceived authorization. No such batch was applied. I first added reproducing tests, then applied narrower fixes with explicit task authorization and behavioral evidence; those actions were approved. No approval block remains.
