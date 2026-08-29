# Instagram Unfollow Radar — Development Roadmap

## Phase 1 — Action safety and quota integrity

Goal: prevent incorrect unfollows and keep destructive actions auditable.

- Fail closed when the follower list cannot be fetched completely.
- Keep dry-run previews separate from real unfollow quota and statistics.
- Prevent statistics reset from resetting the protected 24-hour quota window.
- Complete undo only after Instagram confirms the refollow request.
- Prevent concurrent undo requests.
- Add automated regression tests for these safety rules.

Status: implemented and verified on `codex/phase-1-safety`.

## Phase 2 — Durable execution and concurrency

Goal: make long-running scans predictable across tabs, reloads, and rate limits.

- Enforce a single active automation session across Instagram tabs.
- Persist phase, pagination cursor, queue, and scan checkpoints.
- Resume reliably after rate limits and page reloads.
- Remove duplicate runtime message delivery.
- Classify authentication, challenge, rate-limit, server, and network failures.

## Phase 3 — Watchlist and premium integrity

Goal: improve accuracy for large watched accounts and harden entitlements.

- Replace the 500-user partial snapshot limitation with cursor checkpoints or an explicit cap.
- Serialize concurrent watchlist refreshes and prevent stale storage writes.
- Revalidate licenses periodically and check refund, chargeback, and subscription state.
- Add a bounded offline grace period and document Gumroad data handling accurately.

## Phase 4 — Product experience and release engineering

Goal: make releases repeatable and give users more control before actions.

- Add a pre-action summary and selectable preview list.
- Add filter and whitelist import/export.
- Separate data by Instagram account and stop when the active account changes.
- Add API/storage schema validation, broader integration tests, linting, and CI.
- Generate the store ZIP through a deterministic release command.
- Align privacy, premium, feature, and store documentation with runtime behavior.
