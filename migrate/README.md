# Tri-source migration baseline — review candidate

**Scope:** source reference preservation only. This is **not** a completed application integration, executable release, or security acceptance.

The canonical root `src/`, `package.json`, `bun.lock`, runtime and existing GitHub workflows are retained from DarkFactory-web `main@39341ce5f8459b834c8e20b5227c25980078a87e`. The two intentional root additions are the narrowly scoped `bunfig.toml` test-discovery exclusion and a **PR-only, read-only** `.github/workflows/migration-source-verification.yml` running source integrity and independent app tests. The Bun configuration excludes `migrate/**` from **root-only** Bun test autodiscovery: otherwise `bun test` erroneously runs historical GHCode and nested RSCode suites with wrong dependencies and mismatched dev-server origins (first exact-head Verify run 41509068173 failed). This configuration does not disable any existing root `src` tests. The source-only merge commit has the history checkpoint `53a2e71f1771179139724dadde6f675fea0713b8` as a second parent; historical original Git SHAs remain exact, but historical reachability is **not** functional acceptance.

## Layout

- `rscode/`: full original main Bun/React workbench source with RSC-03 security/RSC-04 single-flight files and tests overlaid from verified preexisting integration, plus native-packaging source from RSC-05 PR #28. **Windows packaging remains failing/unaccepted.**
- `ghcode/`: original full `development@7801784` source with GHC-01 identity isolation; `evidence/ghc00-historical-tests/` holds the separate original regression suite. **GHC-02 unsafe v3 is explicitly excluded; GHC-03 durability is not implemented.** Historical rejected source is still reachable in the retained Git DAG.
- `canvas/`: source and app-specific tests from Canvas PR #41. The original relative structure `.github/app/` and `.github/tests/` is deliberately retained so the generator/test harness resolves source paths. `.agents/` and `repo.dfconfig` are **reference content fixtures**, not active governance for DarkFactory-web. No Canvas workflow or site publishing is imported.

GitHub Actions only discovers workflow files from the repository's top-level `.github/workflows/`. The nested historical workflows within `migrate/rscode/` and `migrate/ghcode/` cannot be selected as root workflows. The dedicated top-level verification workflow has **no push/main trigger, no write permissions and no release/Pages jobs**. GHCode's historical `.darkfactory` gitlink and `.gitmodules` are retained only in the original immutable Git DAG, not copied as an unresolvable nested submodule. No migration source is imported from the active root runtime.

## Reproducible review commands

Run `python3 migrate/verify.py` on the proposed PR checkout with Git history. This checks strict subtree Git hashes, historical-tip reachability, root source isolation, suspicious paths and protected source trees. For independent backup restoration, add `--bundle /path/to/verified.bundle` once the off-GitHub backup is available.

The following **source execution acceptance remains outstanding**:

```sh
cd migrate/rscode
bun install --frozen-lockfile
bun run verify

cd ../ghcode
bun install --frozen-lockfile
bun run check
bun run acceptance

cd ../canvas/.github/app
bun install
bun run check
cd ../../..
node migrate/canvas/.github/tests/persistence/canvas-persistence.mjs
```

**Caveats:** the copied Canvas app has no source-pinned `bun.lock`; Canvas's generator is source-repository-document-oriented; native packaging needs real OS runners and real Chromium; archived GHCode historical tests are not yet behaviorally reconciled. An environment unable to run these tests must report **NOT RUN**, never PASS.

## Provenance and licensing

`manifest.json` records the complete 77 source branch/PR/tag mappings (30 GHCode, 47 template), original SHAs, selected source tree hashes and explicit accepted/rejected/provisional code disposition. Detailed original export reports are retained at `docs/migrations/`.

Both GHCode and Canvas derive from GPL-3.0 sources. DarkFactory-web has no chosen root LICENSE at this checkpoint. The T014 source/asset/dependency-rights decision is **release-blocking**. No GPL-derived code from this snapshot may be shipped as an integrated production binary until legal and supply-chain obligations are resolved.

## Reviewer gate

Do **not** merge until the source tests, provenance verification, security failures, Windows distribution issues, Canvas build, and upstream template-retirement preconditions have been independently dispositioned. Do not delete DarkFactory-template; retire its standalone website in a separate gated PR only after the snapshot is accepted.
