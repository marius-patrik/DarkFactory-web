# W02 implementation checkpoint — 2026-11-03

The W02 acceptance wave is **in progress and not approved for M007**.

## Implemented in this candidate

- GHCode v2 storage does not resolve a write from a request success before its IndexedDB transaction commits. A late transaction abort rejects the write.
- IDB storage operations fence against the currently verified principal at the storage boundary, including stale asynchronous account-switch closures. Unattributed legacy records remain quarantined.
- Targeted Bun tests simulate request success followed by transaction abort, delayed transaction completion, and cross-account access.
- Local staged commits now apply staged removal, overlays, committed-file state, and immutable commit ID under one transaction, checking live staged state for concurrent edits; completed push cleanup clears all three Git stores atomically.
- W01 source CI evidence is normalized into the manifest, with the original tested tree recorded separately from the changed GHCode candidate.
- The root release workflow's main-push event is restricted to active root app paths so source/provenance-only merges cannot trigger publication. Manual release dispatch and existing tag logic remain unchanged.
- The Git backup verifier accepts an independent bundle SHA-256 and checks `git bundle verify` before isolated restore.

## Not represented as complete

- GHC-02 versioned v3 schema/CAS/atomic multi-store operations/secure import-export, GHC-03 DocumentService and guarded Monaco/Dockview lifecycle, and durable push queue remain unimplemented.
- Original off-GitHub ZIPs and embedded bundle were not accessible for W02 rehash or fresh restoration.
- RSCode native Windows/macOS/Linux artifact acceptance and PTY stress tests were not run in this environment.
- Canvas now has a CI-generated Bun 1.3.11 lockfile (SHA-256 `842a1d59da1c5f5b23303193545d3dd6e139f23251269132c7bdc7955e8e3d80`) and frozen-install workflow; exact-head verification pending. Repository-context boundary remains unresolved.
- SBOM/T014 rights and template web retirement remain open.
- This branch is not the unified application. Root production app remains unchanged, and PR #39 must remain draft.

## Historical exact-head W01 evidence

- `d091a26eaa7ab7b814056e2c48ddc922ecebb3ac`
- [Root Verify](https://github.com/marius-patrik/DarkFactory-web/actions/runs/41511237736): PASS.
- [Managed quality](https://github.com/marius-patrik/DarkFactory-web/actions/runs/41511238882): PASS with agent/approvals skipped.
- [Source verification](https://github.com/marius-patrik/DarkFactory-web/actions/runs/41511237804): four jobs PASS (Ubuntu source suites and Chromium where applicable).

No W02 exact-head CI acceptance may be inferred from these earlier W01 runs.
