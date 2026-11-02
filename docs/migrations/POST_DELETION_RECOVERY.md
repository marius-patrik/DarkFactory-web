# Post-deletion source recovery — 2026-11-02

**Scope:** documented GitHub source evidence, not a fresh independent offline backup certification.

The original `marius-patrik/GHCode` remote was deleted by the owner before W01. Never recreate it or rely on its endpoints. The source is preserved through the DarkFactory-web Git DAG, namespaced refs, and previously backed-up bundles/hosted metadata.

## Previously verified evidence

- The GHCode source manifest contains **6 branches, 15 pull-heads, 9 tags**: 30 ref records, 25 distinct commit tips.
- Canvas/template source manifest contains **6 branches, 29 pull-heads, 12 tags**: 47 ref records, 43 distinct commit tips.
- Multi-parent history checkpoint: `53a2e71f1771179139724dadde6f675fea0713b8`.
- Original GHCode source development commit `7801784b5bb596dcc720a48b7085443fc8f9ca3f`, main `534e2203425d91783111e5d02d5ec92649fec594`.
- Independent historical restoration was reported successful in Actions run [41363832152](https://github.com/marius-patrik/DarkFactory-web/actions/runs/41363832152) **before the deletion**.
- Original source backup ZIP: SHA-256 `e81c2d09601111b63432309751234fe9a96161a8c6834a48c79ef1ecf9d8b8f3`, 58,381,826 bytes, archived off GitHub.
- Original hosted-metadata ZIP: SHA-256 `8d8e84844bb6f43a0c60890190cd2fb4dea4068e1a6e0a873ec7acf8d9d2e29a`, 8,452,450 bytes, archived off GitHub.
- Historical Git tips tested by GitHub compare API against checkpoint `53a2e71f...` this wave: GHCode development, main, GHC-00, GHC-02; template development and Canvas #41, all returned `ahead` with `behind_by=0`. This proves sampled tip ancestry, **not** all original 77 refs or bundle restoration.

## W01 certification limits

The W01 environment cannot clone GitHub or download and rehash the private backups; no Desktop Commander device was connected. Therefore **fresh post-deletion restoration: BLOCKED**. Original backup checksum readback was conducted in the earlier T012/T013 workflow, not repeated here. No claim of 68/68 newly reverified commit tips is made.

The proposed migration source commit includes the original preservation checkpoint as an **additional Git parent** while retaining `main` as the first parent, so its tracked production tree is not taken from the former integration branch.

Run `python3 migrate/verify.py` on an unrestricted Git checkout to validate all manifest tip objects with `git merge-base --is-ancestor`, then run with `--bundle <file>` to certify a fresh isolated restore. Compare the exact ZIP checksums above before extracting backup files. Do not declare M001 PASS until that post-deletion procedure is independently evidenced.
