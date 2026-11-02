#!/usr/bin/env python3
"""Fail-closed, source-only migration integrity and ancestry verifier (stdlib)."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "migrate" / "manifest.json"
ALLOWED_NEW_PREFIXES = ("migrate/", "docs/migrations/")
ALLOWED_ADDITIONS = ("bunfig.toml", ".github/workflows/migration-source-verification.yml")
EXPECTED_WORKFLOW_BLOB = "568857f13d25ded6c170dccb426f0f5bd7f4af0c"
EXPECTED_BUNFIG = """# Source reconciliation adds inert nested applications under migrate/.
# Preserve root Bun test discovery without executing their independent suites.
[test]
pathIgnorePatterns = ["migrate/**"]
"""
MIN_FILES = {"rscode": 50, "ghcode": 90, "canvas": 45}


def git(*args: str, cwd: Path = ROOT, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=cwd, text=True, capture_output=True, check=check)


def require(condition: bool, label: str, errors: list[str]) -> None:
    print(("PASS" if condition else "FAIL") + " " + label)
    if not condition:
        errors.append(label)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", type=Path, help="Optional independent Git bundle for offline restoration")
    args = parser.parse_args()
    errors: list[str] = []
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    root_baseline = m["rootBaseline"]["commit"]
    history_parent = m["historyOnlyMergeParent"]
    bootstrap = m["historyOnlyImportCommit"]
    parents = git("rev-list", "--parents", "-n", "1", bootstrap).stdout.strip().split()
    bootstrap_is_ancestor = git("merge-base", "--is-ancestor", bootstrap, "HEAD", check=False).returncode == 0
    require(bootstrap_is_ancestor and parents == [bootstrap, root_baseline, history_parent],
            "preservation bootstrap has exact main+history parents and is an ancestor of HEAD", errors)

    changes = git("diff", "--name-only", root_baseline, "HEAD").stdout.splitlines()
    require(bool(changes) and all(p.startswith(ALLOWED_NEW_PREFIXES) or p in ALLOWED_ADDITIONS for p in changes),
            "source-only diff; no active src/, root config or root workflows modified", errors)
    require((ROOT / "bunfig.toml").read_text(encoding="utf-8") == EXPECTED_BUNFIG,
            "only permitted root config change isolates migrated tests", errors)
    workflow_sha = git("rev-parse", "HEAD:.github/workflows/migration-source-verification.yml").stdout.strip()
    require(workflow_sha == EXPECTED_WORKFLOW_BLOB,
            "only new root workflow is exact PR-only read-only migration source verifier", errors)
    require(not any(p.startswith(".github/workflows/") and p not in ALLOWED_ADDITIONS for p in changes),
            "existing top-level Actions workflows unchanged", errors)

    for name, minimum in MIN_FILES.items():
        base = "migrate/" + name
        expected = m["sourceSnapshots"][name]["snapshotTreeSHA"]
        actual = git("rev-parse", f"HEAD:{base}").stdout.strip()
        require(expected == actual, f"{base} Git tree SHA matches manifest: {actual}", errors)
        paths = git("ls-tree", "-r", "--name-only", "HEAD", base).stdout.splitlines()
        require(len(paths) >= minimum, f"{base} full-tree file floor {minimum} (actual {len(paths)})", errors)

    for source, info in m["sourceHistory"].items():
        if not isinstance(info, dict) or "refs" not in info:
            continue
        refs = info["refs"]
        require(len(refs) == info["counts"]["refs"],
                f"{source} original branch/PR/tag mapping count", errors)
        missing = []
        unreachable = []
        for ref in refs:
            commit = ref["commit"]
            if git("cat-file", "-e", f"{commit}^{{commit}}", check=False).returncode != 0:
                missing.append((ref["ref"], commit))
            elif git("merge-base", "--is-ancestor", commit, "HEAD", check=False).returncode != 0:
                unreachable.append((ref["ref"], commit))
        require(not missing and not unreachable,
                f"{source} all {len(refs)} original Git commit tips ancestors of HEAD"
                + (f" (missing={missing[:4]}, unreachable={unreachable[:4]})" if missing or unreachable else ""),
                errors)

    allpaths = git("ls-tree", "-r", "--name-only", "HEAD", "migrate").stdout.splitlines()
    secret = re.compile(r"(^|/)(?:\.env(?:\.[^/]+)?|id_rsa|credentials\.json|secrets?\.json)$", re.I)
    forbidden = [p for p in allpaths if "/node_modules/" in p or "/.git/" in p
                 or "/dist/" in p or "/out/" in p
                 or (secret.search(p) and not p.endswith((".example", ".sample", ".template")))]
    require(not forbidden, f"migration excludes generated caches and suspicious secret filenames: {forbidden[:8]}", errors)

    for name in ("ghcode", "canvas"):
        require((ROOT / "migrate" / name / "LICENSE").is_file(),
                f"{name} source GPL license preserved", errors)

    for required in (
        "migrate/rscode/src/server/browserService.ts",
        "migrate/rscode/src/tests/runtimeSecurity.test.ts",
        "migrate/rscode/scripts/distribution/build.ts",
        "migrate/ghcode/src/app.tsx",
        "migrate/ghcode/.github/tests/identity-isolation.spec.ts",
        "migrate/ghcode/evidence/ghc00-historical-tests/ghc00-integrity.spec.ts",
        "migrate/canvas/.github/app/src/main.tsx",
        "migrate/canvas/.github/app/src/persistence/indexeddb.ts",
        "migrate/canvas/.github/tests/persistence/canvas-persistence.mjs",
    ):
        require((ROOT / required).is_file(), f"required source fixture {required}", errors)

    if args.bundle:
        bundle = args.bundle.expanduser().resolve()
        require(bundle.is_file(), f"backup bundle exists {bundle}", errors)
        if bundle.is_file():
            with tempfile.TemporaryDirectory(prefix="tri-source-restore-") as temp:
                # Cloning the bundle creates an isolated object database; no remote network is required.
                restored = Path(temp) / "restore"
                clone = git("clone", "--no-checkout", str(bundle), str(restored), check=False)
                require(clone.returncode == 0, f"offline bundle clone: {clone.stderr[:240]}", errors)
                if clone.returncode == 0:
                    tips = {r["commit"] for s in m["sourceHistory"].values() for r in s["refs"]}
                    absent = [sha for sha in sorted(tips)
                              if git("cat-file", "-e", f"{sha}^{{commit}}",
                                     cwd=restored, check=False).returncode != 0]
                    require(not absent, f"offline restoration covers all {len(tips)} source tips", errors)
                    fsck = git("fsck", "--connectivity-only", cwd=restored, check=False)
                    require(fsck.returncode == 0, "offline restored Git fsck connectivity", errors)
    else:
        print("NOT RUN offline Git bundle restoration (pass --bundle /path/to/backup.bundle)")
    print(json.dumps({"status": "FAIL" if errors else "PASS", "errors": errors,
                      "productionChanged": False if not errors else None,
                      "sourceExecution": "NOT RUN (requires Bun/Chromium/OS runners)"}, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
