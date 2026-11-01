# GHC-00: Executable integrity and privacy baseline

**Repository:** `marius-patrik/GHCode` · **Issue:** #24 · **Draft PR:** #30

**Frozen production:** `534e2203425d91783111e5d02d5ec92649fec594`

**Verified implementation starting point:** `development` at `e6328672fcaca1de1cd5f916677158cda8d334e9`

The production and development blobs for `src/workspace/storage.ts`,
`src/workspace/context.tsx`, `src/workspace/model.ts` and
`src/tabs/editor-tab.tsx` are **byte-identical** at these starting SHAs.

This is a reproduction-only dispatch. Production code, schema, workflows,
protected branches and published packages are not changed.

## Test execution provenance

A newly authored GitHub Actions run was triggered by draft PR #30, not reused
from a historical green build. Execution:
`https://github.com/marius-patrik/GHCode/actions/runs/41266654507`.

Environment: GitHub-hosted Ubuntu 24.04, Bun 1.4.4, Playwright 1.55.1,
Chromium headless 140.0.7339.186. Exact local command execution was not
possible from the investigator's container (no Bun or external network, no
connected remote computer). **CI tests are CI-executed, not local tests.**

| Command / step | Result from first PR-head CI |
| --- | --- |
| `bun install --frozen-lockfile` | passed |
| `bun run format:check` | passed |
| `bun run check` (lint, TS, production build) | passed |
| `python3 .github/scripts/generate_documents.py --check` | passed |
| `python3 -m unittest discover -s .github/tests -p 'test_*.py'` | **24 passed**, including dependency graph inventory |
| `bun run acceptance` | **17 passed, 5 intentionally failing safety regressions** |
| Re-run after additional regression extensions | See latest PR checks; do not infer results from the first run |

The full source-and-browser CI is expected to remain red until the P0
integrity defects are addressed in later, separately authorized dispatches.

## Independent browser reproduction results

| ID | Classification at first CI run | Source | Observed (synthetic data only) | Required invariant |
| --- | --- | --- | --- | --- |
| A / anonymous | **VERIFIED** (browser) | `src/workspace/context.tsx:195-211,243-248`; `src/workspace/storage.ts:198-210` | After opening a synthetic private repo as A, signing out and reloading, anonymous UI still selected `acme/private` from cached recent workspace. | Private workspace must not be readable without its authorized principal. |
| A / B | **VERIFIED** (browser) | `src/workspace/model.ts:92-94`; `src/workspace/context.tsx:170-215` | B signs in successfully; mocked GitHub denies access to A's private repository, but the selected UI workspace remains `acme/private`. | Principal/resource keys must isolate A's private snapshots, overlays and blobs from B. |
| Editor close | **VERIFIED** (browser) | `src/tabs/editor-tab.tsx:134-147,237-241`; `src/workbench/shell.tsx:421-429` | Editing then closing with the 250 ms timer deferred yielded no durable overlay record. | Pending edits must survive tab closure or close must be blocked until saved. |
| IDB request/abort | **VERIFIED** (browser) | `src/workspace/storage.ts:51-69` | Injected request success followed by transaction abort; no durable overlay survived, and the UI did not report a save failure. | Promise must settle on transaction completion, reject on abort/quota/error. |
| Interrupted local commit | **VERIFIED** (browser) | `src/workspace/context.tsx:684-728`; `src/workspace/storage.ts:189-197` | Aborting the commit record transaction left a `committed` projection without corresponding durable commit or preserved staged input. | Commit/overlay/staged/committed transitions must be atomic or recoverable. |

These tests preserve correct safety assertions even while failing on the
existing implementation. Do **not** invert expectations to greenwash CI.

**Further probes added later on the same test-only branch:** anonymous/B
private-content rendering, reload before debounce, repository switching,
cross-Dockview tab transfer, and injected QuotaExceededError. Interpret those
only from the newest CI run and its artifacts.

## Persistence schema and browser keys

Actual IndexedDB database: `darkfactory-workbench`, **version 2**.

| Object store | KeyPath | Purpose |
| --- | --- | --- |
| `workspaces` | `id` | `WorkspaceSnapshot` |
| `blobs` | `key` | Cached GitHub blob content |
| `overlays` | `key` | Working-file modifications |
| `staged` | `key` | Staged working files |
| `committed` | `key` | Locally committed file projection |
| `commits` | `id` | Local commit log |

Workspace identity is `fullName@ref` (no account identity). Blob keys
are `workspaceId:sha`; file keys are `workspaceId:path`. Recent
snapshots are not partitioned by principal.

LocalStorage keys observed in source:
`workbench-recent-workspaces-v1`, `workbench-layout-v2`,
`workbench-layout-v1` (legacy read), `workbench-theme`,
`ghcode-concern`.

SessionStorage keys:
`workbench-github-token`,
`workbench-github-auth-transaction`,
`workbench-github-auth-result`.

Migration example `.github/tests/fixtures/ghc00-synthetic-v2.json`
contains only synthetic A/B identities and inert repo/blob/file records;
it intentionally contains **no credentials**.

## Dependency graph and state ownership

The read-only `.github/tests/test_ghc00_dependency_graph.py` captures
actual source imports on each CI run. First run: **54 source modules,
152 internal import edges, zero strongly connected import cycles.**

That does not establish state ownership correctness. Critical ownership
crossings:

- `src/workspace/context.tsx` owns authenticated user, current repository,
  in-memory overlays/staged/committed state, GitHub reads/writes, and commits.
- `src/workspace/storage.ts` independently persists v2 snapshots, blobs,
  file layers and commit records; storage operations lack account ownership
  and atomic transaction coordination.
- `src/tabs/editor-tab.tsx` owns an additional unsaved local `value`
  with an independent 250 ms async write, while workspace context owns the
  canonical overlay state. Closing/moving/disposal clears timers.
- `src/workbench/shell.tsx` owns Dockview panel/tab lifecycle and layout;
  `src/workbench/persistence.ts` owns layout serialization. Neither
  mediates unsaved-editor close.
- `src/github/auth.ts` owns the session token, but sign-out does not clear
  or invalidate account-owned workspace/content caches.
- `src/factory/context.tsx` owns current factory concern with a separate
  localStorage preference `ghcode-concern`.

**Actual placeholders:** `src/tabs/problems-tab.tsx` displays only
"No diagnostics"; `src/tabs/output-tab.tsx` displays only "No output yet".
These are not test evidence of a functioning diagnostics or output service.
`src/tabs/document-tab.tsx` is a thin wrapper over the editor.

## Migration preconditions (not implementation authorization)

1. Define a principal/account identity policy and safely classify preexisting
   anonymous v2 records without exposing private records across principals.
2. Define resource ownership boundaries for repository, ref, blob, overlay,
   document, staged state, commit log and layout references.
3. Introduce transaction-completion acknowledgments and atomic or journaled
   multi-store transitions with interrupted-operation recovery.
4. Introduce a single durable document owner and explicit close, move,
   switch, unmount, reload and write-failure semantics.
5. Validate v2-to-next-schema migration using only sanitized fixtures.
   Do not clear actual customer data to make tests pass.

## Remaining limits

- Browser regressions execute against isolated Playwright contexts and
  synthetic GitHub API fixtures; no real private credentials/data are used.
- Browser behavior beyond Chromium and the tested UI paths remains unknown.
- Repository/API errors, constraint failures, true disk-quota exhaustion,
  browser crash mid-commit and concurrent multi-tab edits need further
  specialized fixtures before declaring these cases verified.
- Tests distinguish a reported P0 from a deployable correction: **no
  production fix has been made in GHC-00**.

**Handoff:** draft PR #30 targets `development`; orchestrator controls
subsequent contract approval and migration work.
