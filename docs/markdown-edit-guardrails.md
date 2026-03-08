# Markdown Edit Guardrails

## Objective

Turn the phase-1 design into a concrete, CI-checkable safety baseline for future markdown editing.

This repository does **not** grant arbitrary markdown write access. Any future editor/sync flow must prove that it stays inside approved repo-relative roots, takes a rollback snapshot before overwrite, and emits an audit record.

## Scope touched

- `config/markdown-boundaries.json`
- `scripts/check_markdown_boundaries.py`
- `.github/workflows/markdown-boundaries.yml`

No live runtime, runner, service, or production-like environment is mutated by this change.

## Risk level

Medium policy risk, low execution risk.

- Low execution risk because this is repo-only policy/documentation/CI work.
- Medium policy risk because an incorrect allowlist could still permit unsafe future paths.

## Enforced boundary

Allowed markdown roots are currently limited to:

- `docs/**`
- `content/**`
- `fixtures/markdown/**`

The policy denies writes or save targets under sensitive roots such as:

- `.git/`
- `.github/`
- `.ssh/`
- `state/`
- `secrets/`
- `tmp/`

It also blocks path traversal fragments (`../`, `..\\`) and non-markdown extensions.

## Backup / audit requirements

Before any future write-enabled implementation is allowed to ship, the policy requires:

- rollback snapshots under `.rollback/markdown-edits/`
- append-only audit records under `.audit/markdown-edits.jsonl`

This commit does not implement the write path itself; it hardens the contract that future implementations must satisfy.

## CI / local verification

Local check:

```bash
python3 scripts/check_markdown_boundaries.py --verify-artifact-layout
```

Optional targeted path probe:

```bash
python3 scripts/check_markdown_boundaries.py --check-path docs/runbook.md --check-path ../outside.md
```

The `--verify-artifact-layout` mode does **not** mutate the repo working tree. It creates the configured rollback/audit targets inside a temporary sandbox, proves they can be materialized as a directory + append target under a repo-relative root, and then removes that sandbox immediately.

CI check:

- GitHub Actions workflow: `.github/workflows/markdown-boundaries.yml`
- Fails if:
  - the allowlist becomes dangerously broad
  - backup/audit requirements are disabled
  - known-good fixture paths are denied
  - known-bad paths are allowed

## Rollback path

This change is fully reversible through git:

```bash
git revert <commit>
```

If a future implementation incorrectly relies on this policy, recover by:

1. reverting the offending implementation commit or PR
2. restoring content from `.rollback/markdown-edits/`
3. reviewing `.audit/markdown-edits.jsonl` to identify the actor, target path, and previous state

## Remaining risk

- This policy is repo-local and does not by itself enforce host-level filesystem sandboxing.
- Future runtime code must actually call the validator before write/apply/sync.
- Human review is still required for expanding allowlists or enabling non-read-only behavior.
