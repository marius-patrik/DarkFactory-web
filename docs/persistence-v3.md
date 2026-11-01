# GHC-02: IndexedDB v3 implementation contract (draft)

**Tracking:** Advances #26 and #32. Source branch: `agent/ghc-02-transactional-v3`.
This document describes **unreleased** code. It is not an acceptance certification.

## Ownership

Principal, repository and repository-session identities are defined only by `src/workspace/identity.ts`.
An owned workspace's session identifier is immutable, and every v3 mutable record stores
`sessionId` and `principalKey`. Repository full names are metadata and must never authorize a cache.
Remote GitHub authorization is performed by `WorkspaceProvider` before a cached private workspace
is restored. Browser same-origin scripts still share IndexedDB: this is **not cryptographic isolation**.

## Physical schema

Database `darkfactory-workbench`, version **3**. The six preexisting stores
`workspaces`, `blobs`, `overlays`, `staged`, `committed` and `commits`
remain untouched by ordinary production writes.

| V3 store | Primary key | Indexes | Purpose |
| --- | --- | --- | --- |
| `v3_sessions` | `id` | `byPrincipal`, `byWorkspace`, `byRepository` | Immutable principal, repository identity and ref; monotonic session revision; snapshot |
| `v3_records` | `id` | `bySessionKind`, `byPrincipal` | Discriminated `blob/overlay/staged/committed/commit` records |
| `v3_revisions` | `id` | none | Immutable snapshots of staged input |
| `v3_legacy` | `id` | `bySource` | Quarantined historical IDB records and sensitive localStorage |
| `v3_manifests` | `id` | none | V2 preservation and explicit-adoption manifests |
| `v3_push_ops` | `id` | none | Persistent remote push intent and outcome |

The logical notions of named workspaces, repository identities, file resources, revisions and push
operations are represented through these consolidated stores rather than an artificial one-store-per-noun
mapping. Multiple sessions may reference the same repository/ref without sharing mutable records.

## Lifecycle

```text
fresh open              -> create v3 stores -> session available
v2 open                 -> atomic schema upgrade/quarantine (six stores preserved)
v2 owned session access -> validate canonical ownership -> atomic copy to v3 -> manifest
unattributed v2         -> quarantine (no automatic ownership) -> export or explicit recovery
explicit recovery       -> verify repo ID/ref and user confirmation -> transactionally copy
                       -> manifest (never overwrite an existing local working tree)
```

Migration copies do not delete their sources. Unexpected malformed rows are retained in quarantine.
The source of unattributed data is not inferred from whichever account is currently authenticated.
Historical recents/layouts are kept in localStorage and captured into `v3_legacy`; legacy private
tabs are never silently inserted into a new principal's workbench.

### Durable transaction contract

`storage-v3.ts` opens a readwrite transaction, loads the current revision, validates identity
and expected revision, schedules all mutation requests, then resolves **only from `tx.oncomplete`**.
Abort, quota, constraint and database failures reject. Web Locks coordinate same-session operations
when supported; without Web Locks a local queue serializes this tab and persisted revision checks reject
conflicting cross-tab writers. BroadcastChannel is only an invalidation signal, never a lock.

Grouped operations include stage/unstage, stage-all, discard, rename, committed-tree projection,
local commit record + staged consumption, creating a separate branch session, and push settlement.
Immutable staged file values are copied into local commits; working changes made later do not replace
previously staged content. No GitHub network calls execute inside a live IDB transaction.

### Push recovery

Local commit preparation is preceded by a durable `preparing` intent; before the remote ref write,
the known target SHA is persisted as `target-ready`. A successful GitHub ref update is external to
IndexedDB. Settlement checks the target SHA and session revision and atomically updates the base
and removes only the committed queue, preserving staged data. On unknown outcomes the next push
reads the remote ref. If the remote matches a persisted target, the session is settled; otherwise it
fails closed with local work retained. **Divergent or ambiguous outcomes still need an explicit
manual recovery workflow.** A remote ref update cannot be rolled back by a local IDB failure.

## DocumentService handoff (#27)

GHC-02 provides transactionally persisted working, staged and committed records. It does **not**
provide GHC-03's shared authoritative Monaco model, durable `flush`, or tab-close guard. A
250-ms edit debounce remains and an unflushed editor buffer cannot be guaranteed durable on crash.
Document-level stable IDs and per-buffer revisions must be integrated and tested by GHC-03 before
the application is called fully crash-safe.

## Evidence and gate

Source checks: `bun install --frozen-lockfile`, `bun run format:check`,
`bun run check`, `bun run acceptance`, generated docs check and repository Python tests.
All repository tests and synthetic fixtures reside in `.github/tests/`.
Do not merge, deploy, release, or claim migration-safe production behavior until independent
browser migration/abort/rollback tests and a reviewed final diff have passed.
