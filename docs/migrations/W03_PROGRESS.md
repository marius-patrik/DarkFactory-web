# W03 — Implementation checkpoint and independent acceptance ledger

**Status: CHANGES REQUIRED — draft PR #39, never merged or deployed.**

This is an incremental checkpoint in the W01 → W02 → W02-R history. It is **not** a full GHCode v3 migration, complete Dockview acceptance, native release or unified application. Source-only main integration is not authorized by this report.

## A. Repository state

- Canonical repository: `marius-patrik/DarkFactory-web`.
- W03 started from W02-R `dfcf438d68a38abcc63176fe8eb3bec70299a0db`.
- Work branch: `integration/tri-source-migration-baseline`, PR #39 (draft).
- Production main remains `39341ce5f8459b834c8e20b5227c25980078a87e`.
- All work is committed incrementally on existing PR head. Original source histories and 77 historical branch/PR/tag references are unchanged.
- Source tree fingerprints and W03 checkpoints are in `migrate/manifest.json`. GitHub's tree objects, not literal file hashes, are the authoritative fingerprints.
- The latest tested source-only W03 checkpoint prior to this report is `68e4b2a928a3c557b9f87909c9e0d782d96043b6`. Later commit(s) require their own exact-head checks.

## B. GHCode resource security and persistence

**Implemented (not fully accepted):**
- Strict percent-encoded document identity carries exact principal, owned workspace/session, immutable numeric repository ID, selected ref, base SHA and source path; malformed, ambiguous, foreign-principal and invalid-path IDs fail closed.
- DocumentService authorization uses validated parsed resource identity, no substring matching. Storage rejects malformed owned IDs and wrong active principal.
- A real IndexedDB readwrite-transaction `compareAndSetOverlay` performs compare-and-swap on old overlay value and acknowledges only transaction completion. New Monaco document writes use this operation; a browser test races two CAS writers, stale deletes, and cross-account mutation.
- Existing W02-R version-3 push journal and atomic local-commit transition remain preserved.
- Patch export no longer interprets arbitrary read/authentication failures as file deletions.

**Not complete:** a canonical all-record v3 schema; full resource ownership at every store boundary; durable staged/commit/draft CAS across all UI paths; secure import/export and legacy migration with ownership proof and repeated/blocked upgrade recovery. Older storage mutation APIs remain available without the new CAS semantics.

## C. DocumentService lifecycle

- Monaco model key and URI now follow canonical document ID, including immutable base revision/ref, to avoid stale model reuse after a push.
- Forced authorization invalidation revokes document authority and seals dirty bytes in a principal-bound **in-memory** suspended map; the original principal may reauthenticate, reopen and retry. Generation fencing rejects obsolete in-flight write receipts.
- Browser unload warnings include private suspended drafts; cross-tab invalidation presents an explicit warning about recoverability.
- An added unit regression tests cross-account revocation and same-principal dirty draft recovery.

**P0 unresolved:** private suspended bytes are not durable against browser close, process kill or crash. Native Dockview group/panel/transfer/reset transitions and a full multi-view/release/ref lifecycle matrix are not independently accepted. There is no assertion that in-memory quarantine satisfies durable backup.

## D. GitHub push recovery

- The GitHub REST non-forced ref update was removed from the write path. The GraphQL `updateRefs` mutation takes `RefUpdate.beforeOid = journal.expectedRemoteSha`, `afterOid = journal.targetSha`, `force=false`. This is provider-enforced expected-old-SHA CAS rather than fast-forward-only behavior.
- Deterministic unit transport tests validate exact GraphQL input, conflicts and invalid credentials/ref/SHA; the real Chromium mock rejects REST PATCH and exercises conditional mutation.
- Existing durable `prepared → ready → remote-confirmed → completed` phases and remote reinspection are retained.

**Still missing:** live GitHub permission/protected-branch contract verification; comprehensive network-uncertainty, concurrent-writer and authorization-revocation fault injection; full user-visible reconciliation UX listing expected/observed/target SHA and pending commits. No live private GitHub credentials used in CI.

## E. RSCode

- Original RSCode migration subtree is untouched by W03; the existing Ubuntu source CI is preserved.
- The root app and RSCode browser/native intermittent failures are **not repaired**. Root Verify failed at W03 code head `68e4b2a9` in `browser frame service streams native blank pages` (20-second test timeout) while source history, source RSCode, Canvas and GHCode CI passed.
- Windows x64, Linux x64, macOS ARM64 and macOS x64 **native archives installed and acceptance-tested outside the checkout: NOT RUN**. No artifacts/checksums for newly verified native release may be asserted.

## F. Canvas

- Added injected `RuntimeRepositoryAdapter` with read-only `load(selection,signal)` and optional `list(signal)`. Strict `verifyRuntimeContext` requires matching provider+immutable repo ID+ref+revision.
- Changing repository clears old source content and aborts old requests. Source consumers (Canvas graph/files, Library, sidebar, Omnibar, App chrome, Navigator selector) now subscribe to the selected context.
- Added five contract tests for valid selection, stale/reused repository or ref, missing identity, partial/empty contexts and path/size bounds. Existing five parser tests and 23 real IndexedDB tests remain.
- Standalone Canvas intentionally keeps build-time generated source only as the default when **no runtime adapter is injected**. This is not a second runtime persistence writer.

**Still missing:** unified successor adapter integration and real Chromium multi-repository/context-switching acceptance (including large datasets and accessibility/responsive states).

## G. Migration integrity and release guard

- Manifest records W03 provisional changes and source Git tree SHAs; history and isolation CI verifies all 77 preserved source refs, root isolation, exact SHA and release trigger guard.
- Original source commit DAG and RSCode production main were not rewritten.
- Original independent ZIP backup hashes, `git bundle verify`, offline restore, and 68-tip connectivity: **NOT RUN** (private backups inaccessible). Earlier archival claims remain archival; no fresh evidence is invented.
- Source-only changes are confined to `migrate/**`, source CI/manifest/docs, and root-independent checks; no production merge, deployment or release.

## H. Dependency and licensing evidence

- Added reproducible `migrate/sbom.py` CycloneDX **1.6** generator for all three Bun locks, exact resolved package versions, SHA512 integrity where provided, package metadata/declared licenses when installed and resolvable edges. Nested Bun lock aliases are consolidated without losing nested path provenance.
- Source CI uploads separate `rscode.cdx.json`, `ghcode.cdx.json`, `canvas.cdx.json` artifacts (retention 30 days) on source PR verification. No publication/redistribution.
- The generator explicitly marks absent license metadata and ambiguous dependency edges. These inventories are **not** full supply-chain certification, license compatibility opinions or coverage of all packaged binaries/fonts/icons/assets.
- No inherited GPL-3.0 files removed; owner must decide successor distribution license after verified dependency/asset rights review.

## I. DarkFactory-template retirement

- Inspected retained repository `marius-patrik/DarkFactory-template`: `main` `63a6e0e0c044deead678a7f7c7a3551450eda8b2`; `development` `5f462ea6e73c570e483149d6846dcc9190c09d51`.
- PR #42 is merged into development; PR #41 is still draft/open against development; PR #34 is still open and not draft.
- No web removal/deployment shutdown performed because owner/orchestrator has not accepted the source-only baseline into main. Generic governance/template functionality remains untouched. Retirement implementation and PR: **NOT RUN**.

## J. CI evidence (revision-specific, not blanket acceptance)

| Exact candidate | Workflow | Result | Scope |
| --- | --- | --- | --- |
| `dfcf438d68a3` | [Source 41631182949](https://github.com/marius-patrik/DarkFactory-web/actions/runs/41631182949) | PASS | W02-R original 4 source jobs |
| `34c6807ca6a3` | [Source 41833061324](https://github.com/marius-patrik/DarkFactory-web/actions/runs/41833061324) | FAIL | GHCode Playwright 31/32; Monaco absent after push |
| `68e4b2a928a3` | [Source 41833602443](https://github.com/marius-patrik/DarkFactory-web/actions/runs/41833602443) | PASS | History/isolation, RSCode, GHCode 21 Bun and 32 Chromium, Canvas typecheck/lint/format/build/10 context tests/23 IndexedDB/Chromium smoke; per-source SBOM artifacts |
| `68e4b2a928a3` | [Root Verify 41833602447](https://github.com/marius-patrik/DarkFactory-web/actions/runs/41833602447) | FAIL | Existing intermittent native blank-page browser frame test (20s) |
| `68e4b2a928a3` | [Runtime 41833603368](https://github.com/marius-patrik/DarkFactory-web/actions/runs/41833603368) | PASS | Root DarkFactory runtime workflow |
| `8a2d5067fb37` | [Source 41834186035](https://github.com/marius-patrik/DarkFactory-web/actions/runs/41834186035) | PASS | **All 4 source jobs**, GHCode 21 Bun + 32 Chromium, Canvas 10 context + 23 real IndexedDB + smoke, RSCode Ubuntu, 77 source refs, three SBOM artifacts |
| `8a2d5067fb37` | [Root Verify 41834188206](https://github.com/marius-patrik/DarkFactory-web/actions/runs/41834188206) | PASS | Root verification |
| `8a2d5067fb37` | [Runtime 41834187422](https://github.com/marius-patrik/DarkFactory-web/actions/runs/41834187422) | PASS | DarkFactory runtime quality checks |

At `8a2d5067fb3715398f8d0713e85f4ab46e04472a`, the source-only code, export correction, W03 report, root Verify, Runtime and all source jobs passed. The later provenance-only manifest/documentation commits do not alter the source subtree SHA; they nevertheless require their own exact-head CI record. Passing any of these checks does not close the P0 acceptance gaps or the earlier reproducible root browser blank-frame failure.

## K. Unresolved blockers

- **Security:** full resource authorization at every IndexedDB/read/export/import boundary, UI revocation paths, live GitHub auth/provider error semantics.
- **Data integrity:** lossless v2 migration, full cross-record v3 CAS, crash-durable principal-specific draft recovery, audited import/export and recovery paths.
- **Functionality:** Dockview all destructive transitions and concurrent independent tabs; detailed pending-push reconciliation UI.
- **Platform:** RSCode browser-frame flakiness; native Windows/Linux/macOS archives and real platform acceptance.
- **Reproducibility:** reproducible actual distribution, signed archives, offsite Git bundle restoration.
- **Licensing:** full assets/fonts/Chromium/native notices and owner license determination.
- **Deployment:** source-only main merge, new unified shell/adapter and Pages/native publication not authorized.
- **Governance:** independent baseline review, historical crosswalk acceptance, template app retirement PR unstarted.

## L. Verdict

**CHANGES REQUIRED.**

Source-history and snapshot provenance are stronger, and meaningful new security/identity/CAS/browser behavior has been implemented and tested. Unresolved P0 durability and lifecycle defects prohibit claiming the source is fully safe or functionally accepted.

## M. Suggested W04 (not dispatched)

Complete one coherent **GHCode durable authority + full lifecycle acceptance** wave: explicit account/repository/session-bound v3 resources; non-destructive legacy backup and attribution; transactional CAS for all mutators; crash-safe sealed recovery; every Dockview/native tab close and transfer; remote push conflict-reconciliation UX with provider contract and fault injection. Preserve source-only snapshots under `migrate/`, then undertake a distinct independent W04 acceptance audit. Only after those gates should the orchestrator consider merging the source-only baseline and starting unified app construction.
