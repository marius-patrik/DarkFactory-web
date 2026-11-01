#!/usr/bin/env python3
"""Verify the source-controlled DarkFactory installation receipt after repository rename."""
import hashlib
import json
import os
from pathlib import Path

root=Path(__file__).resolve().parents[2]
config=json.loads((root/"repo.dfconfig").read_text(encoding="utf-8"))
receipt=json.loads((root/".darkfactory/installation.json").read_text(encoding="utf-8"))
identity=config["repo"]["identity"]
slug=f'{identity["owner"]}/{identity["repo"]}'
assert slug == "marius-patrik/DarkFactory-web", f"Stale repository identity: {slug}"
assert receipt["slug"] == slug, f"Receipt slug does not match repository: {receipt['slug']}"
assert receipt["sourceBranch"] == identity["default_branch"] == "main"
assert receipt["managedBy"] == "DarkFactory" and receipt["schema"] == 2
assert receipt["release"]["sha"] == config["repo"]["upstream"]["ref"]
for relative_path,expected in receipt["fileHashes"].items():
    actual=hashlib.sha256((root/relative_path).read_bytes()).hexdigest()
    assert actual == expected, f"Managed file hash mismatch: {relative_path} expected={expected} actual={actual}"
actual_repository=os.environ.get("GITHUB_REPOSITORY")
if actual_repository:
    assert actual_repository == slug, f"GitHub repository mismatch: {actual_repository}"
print("Verified DarkFactory managed installation owner, source branch, upstream pin and file hashes:", slug)
