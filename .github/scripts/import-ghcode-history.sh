#!/usr/bin/env bash
# Preserves all GHCode visible Git heads/tags/PR heads in RSCode ancestry.
# This NEVER checks out or executes source code from GHCode.
# This NEVER modifies main, production releases, or GHCode.
set -euo pipefail
source_url="${GHCODE_URL:?GHCODE_URL required}"
target_branch="${IMPORT_BRANCH:?IMPORT_BRANCH required}"
test "$target_branch" = "integration/ghcode-consolidation"
initial="$(git rev-parse HEAD)"
git diff --quiet
git diff --cached --quiet
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git remote add ghcode "$source_url"
git fetch --no-tags ghcode '+refs/heads/*:refs/remotes/ghcode/*'
git fetch --no-tags ghcode '+refs/tags/*:refs/tags/ghcode/*'
git fetch --no-tags ghcode '+refs/pull/*/head:refs/remotes/ghcode-pr/*'

test "$(git rev-parse refs/remotes/ghcode/main)" = "534e2203425d91783111e5d02d5ec92649fec594" || {
  echo "::error::GHCode main moved. Stop and reevaluate the source baseline."
  exit 1
}

mkdir -p docs/migrations
python3 - <<'PY'
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()

raw = git("for-each-ref", "--format=%(refname) %(objectname)", "refs/remotes/ghcode", "refs/remotes/ghcode-pr", "refs/tags/ghcode")
refs = []
for line in raw.splitlines():
    name, original_object = line.split(" ", 1)
    commit = git("rev-parse", "--verify", name + "^{commit}")
    refs.append({"ref": name, "object": original_object, "commit": commit})
assert any(r["ref"] == "refs/remotes/ghcode/main" for r in refs)
heads = sorted({r["commit"] for r in refs})
assert len(heads) > 1
Path("/tmp/ghcode-commit-tips.txt").write_text("\n".join(heads) + "\n")
payload = {
    "source": "marius-patrik/GHCode",
    "target": "marius-patrik/RSCode",
    "method": "multi-parent no-squash ancestry import",
    "sourceMain": "534e2203425d91783111e5d02d5ec92649fec594",
    "originalHistoryPolicy": "Retain original commit SHAs and every fetched branch, tag and pull/head in RSCode ancestry.",
    "integrationPolicy": "Import is history-only. No GHCode runtime code is enabled until separately audited and adapted into the RSCode architecture.",
    "unsafeSourceCandidates": [
        {"ref": "refs/remotes/ghcode/agent/ghc-02-transactional-v3", "reason": "PR #34 failed independent principal-isolation and push-queue review. Preserve history, do not enable as production code."}
    ],
    "counts": {
        "refs": len(refs),
        "uniqueTipCommits": len(heads),
        "branches": sum(x["ref"].startswith("refs/remotes/ghcode/") for x in refs),
        "pullHeadRefs": sum(x["ref"].startswith("refs/remotes/ghcode-pr/") for x in refs),
        "tags": sum(x["ref"].startswith("refs/tags/ghcode/") for x in refs)
    },
    "refs": sorted(refs, key=lambda x: x["ref"])
}
Path("docs/migrations/GHCODE_GIT_HISTORY.json").write_text(json.dumps(payload, indent=2) + "\n")
print("Imported refs:", payload["counts"])
PY

git add docs/migrations/GHCODE_GIT_HISTORY.json
tree="$(git write-tree)"

# Use batches to avoid a huge octopus commit and to keep the complete
# original Git object DAG reachable from one RSCode integration branch.
last="$initial"
batch=()
batch_no=0
while IFS= read -r source_commit; do
  [[ -n "$source_commit" ]] || continue
  # Existing reachability includes each prior batch and the RSCode base.
  if git merge-base --is-ancestor "$source_commit" "$last"; then
    continue
  fi
  batch+=("$source_commit")
  if [[ "${#batch[@]}" -ge 8 ]]; then
    parents=(-p "$last")
    for sha in "${batch[@]}"; do parents+=(-p "$sha"); done
    batch_no=$((batch_no + 1))
    last="$(printf 'Preserve original GHCode Git ancestry (batch %d; no runtime changes)\n' "$batch_no" | git commit-tree "$tree" "${parents[@]}")"
    batch=()
  fi
done < /tmp/ghcode-commit-tips.txt
if [[ "${#batch[@]}" -gt 0 ]]; then
  parents=(-p "$last")
  for sha in "${batch[@]}"; do parents+=(-p "$sha"); done
  batch_no=$((batch_no + 1))
  last="$(printf 'Preserve original GHCode Git ancestry (batch %d; no runtime changes)\n' "$batch_no" | git commit-tree "$tree" "${parents[@]}")"
fi
test "$batch_no" -gt 0

while IFS= read -r original; do
  [[ -n "$original" ]] || continue
  git merge-base --is-ancestor "$original" "$last" || {
    echo "::error::Source commit $original is not reachable from import commit."
    exit 1
  }
done < /tmp/ghcode-commit-tips.txt

# Confirm RSCode local source files are unchanged; only the manifest is new.
git diff --exit-code "$initial" "$last" -- src package.json bun.lock rsbuild.config.ts tsconfig.json
git reset --hard "$last"
git push origin "HEAD:refs/heads/$target_branch"

# Namespaced original release tags are retained without collisions with RSCode tags.
git push origin 'refs/tags/ghcode/*:refs/tags/ghcode/*'

echo "Imported GHCode original Git history into RSCode $target_branch at $last."
echo "Imported original release tag refs to refs/tags/ghcode/*."
echo "No application source changed; no source repository deletion was attempted."
