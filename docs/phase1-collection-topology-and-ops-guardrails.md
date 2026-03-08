# Phase 1: Collection Topology, Permission Boundaries, CI and Rollback Plan

## Objective

Plan a safe, reversible first-phase operating model for `openclaw-monitor`, covering:

- deployment relationship between `openclaw-monitor`, `OpenClaw`, and `claw_team`
- read-only monitoring boundaries
- future `md` file view/edit/save/sync permission boundaries
- file sync, conflict handling, and rollback design
- CI-verifiable checks vs manual acceptance checks
- major risks, rollback paths, and residual risk

## Scope touched

- Design only for phase 1
- No live deployment mutation
- No secrets, host firewall, runner, or production config changes in this document

## Risk level

Medium design risk, low execution risk for this change set.

- Low execution risk because this commit adds documentation only
- Medium design risk because poor boundary decisions could later create excessive write access

## Rollback path

This change is documentation-only.

- `git revert <commit>` after merge, or
- delete this document in a follow-up PR if the design is replaced

## Verification steps

- Review the topology and boundary sections against issue requirements
- Confirm the plan keeps phase 1 monitoring read-only
- Confirm every future write path is explicitly gated
- Confirm CI checks are automatable and do not require production credentials

## Remaining unknowns

- final runtime form of `openclaw-monitor` (standalone service vs embedded panel)
- canonical source of truth for synchronized markdown content
- whether future editing is local-first, repo-first, or OpenClaw-managed
- exact auth mechanism used for any future write-enabled control plane

---

## 1. Recommended deployment relationship

## 1.1 Phase 1 topology

Recommend `openclaw-monitor` start as a **read-only sidecar-style observer**, not as an in-process extension with broad filesystem write access.

```text
+--------------------+        read-only APIs / read-only mounts        +----------------------+
|   OpenClaw         | ----------------------------------------------> |  openclaw-monitor    |
|   runtime / docs   |                                                 |  collector + UI/API  |
+--------------------+                                                 +----------------------+
          |
          | read-only metadata / status
          v
+--------------------+
|   claw_team        |
|   task/memory/md   |
+--------------------+
```

### Recommended relation

- `OpenClaw` remains the orchestration/control system
- `claw_team` remains the working content space
- `openclaw-monitor` only **collects and presents** status in phase 1
- collection should happen through:
  - explicit read-only CLI/API outputs when available
  - read-only filesystem mounts for approved paths
  - periodic snapshots/exports instead of direct mutation

### Why this is safer

- keeps blast radius small
- avoids accidental edits to task/memory/coordination files
- makes rollback simple because phase 1 adds observation, not control
- allows later write features to be introduced behind narrower gates

## 1.2 Preferred runtime layout

Recommend three logical layers:

1. **Collector layer**
   - reads approved sources
   - normalizes state into snapshot artifacts
2. **State/cache layer**
   - stores derived monitoring snapshots
   - no direct authority to mutate upstream sources
3. **Presentation/API layer**
   - serves dashboards and drill-down views
   - future write intents go through a separate guarded workflow, not the collector

This avoids coupling the monitor UI to direct host or repo mutation.

---

## 2. Permission boundaries

## 2.1 Phase 1 read-only monitoring boundary

Phase 1 should allow only the following classes of access:

- process / service health inspection
- pipeline status inspection
- branch / PR / issue metadata inspection
- selected markdown file content inspection
- selected file metadata inspection (`path`, `mtime`, `hash`, `owner`, `size`)

Phase 1 must **not** allow:

- direct markdown writes
- git push, merge, or branch deletion
- service restart / deployment mutation
- runner registration changes
- secret reads beyond what is strictly needed for metadata-only APIs
- arbitrary filesystem traversal outside allowlisted roots

## 2.2 Filesystem boundary for markdown observation

Use explicit allowlists.

Recommended approved roots:

- OpenClaw docs or exported monitor inputs
- `claw_team/runtime/agents/*/workspace/*.md`
- `claw_team/runtime/agents/*/workspace/memory/**/*.md` only if intentionally included
- repo-local planning and task markdown for approved projects

Denied by default:

- `.ssh/`
- `.github/github_token`
- secret state directories
- shell history
- non-markdown runtime state
- unrelated project roots

## 2.3 Future write boundary for markdown edit/save/sync

When write support is introduced later, do **not** reuse the read-only collector identity.

Use a separate write path with all of the following:

- distinct service identity / token
- per-repo or per-root allowlist
- operation-level authorization (`view`, `propose_edit`, `apply_edit`, `sync`)
- mandatory audit log containing actor, file, old hash, new hash, timestamp
- optimistic locking using file hash or git base SHA
- dry-run preview before apply
- rollback artifact before overwrite

Recommended capability split:

- `monitor-reader`: read-only access only
- `monitor-editor`: can propose edits in a staging area, cannot publish
- `monitor-sync`: can execute approved sync operations with git/audit controls

This prevents the dashboard from silently becoming a broad write surface.

---

## 3. Markdown view/edit/save/sync operating model

## 3.1 View

Viewing should read one of:

- current working tree file
- last indexed snapshot
- latest committed git version

The UI must clearly label which source is being shown.

## 3.2 Edit/save

Do not edit upstream markdown files directly in phase 1.

For later phases, recommended sequence:

1. load current file content plus source hash
2. create edit in a staging copy or patch representation
3. run validation (path allowlist, size limits, markdown sanity)
4. show diff preview
5. apply only if source hash still matches
6. create rollback artifact before final write

## 3.3 Sync

Prefer **git-backed sync** over ad hoc file copying whenever the monitored content belongs to a git repo.

Recommended sync order:

1. fetch latest upstream state
2. compare base SHA / file hash
3. detect conflicts before write
4. create branch or patch bundle
5. run CI / validation checks
6. require explicit approval for publish/merge

For non-git markdown sources, use:

- versioned snapshots
- content hash checks
- timestamped backups
- append-only audit log

---

## 4. Conflict handling

## 4.1 Conflict classes

1. **stale-read conflict**
   - file changed after monitor loaded it
2. **multi-writer conflict**
   - different actor edited same file/region
3. **sync-target drift**
   - target branch/repo moved ahead
4. **schema/format conflict**
   - document shape no longer matches editor expectations

## 4.2 Conflict policy

Default policy: **never auto-resolve semantic markdown conflicts silently**.

Instead:

- block apply when base hash changes
- present diff between:
  - loaded base
  - current source
  - proposed change
- allow user to rebase or regenerate patch
- preserve rejected patch for manual recovery

Safe auto-resolution is acceptable only for metadata-only, non-semantic fields if clearly scoped and tested.

---

## 5. Rollback design

## 5.1 Phase 1 rollback

Since phase 1 is read-only monitoring, rollback is mostly operational:

- stop or disable collector job/container
- revert monitor config to previous snapshot
- remove latest derived state/cache if corrupted
- redeploy previous monitor image/tag

No upstream markdown or repo state should require rollback in phase 1.

## 5.2 Future write rollback

For any future edit/sync action, require at least one rollback path:

### Git-backed sources

- revert commit
- close/reject PR
- reset branch before merge if unpublished

### Non-git sources

- restore timestamped backup copy
- restore previous content by content-addressed snapshot
- replay prior approved version from audit log

## 5.3 Rollback artifacts required before write

Before any overwrite or sync publish, store:

- previous file hash
- previous content snapshot or git blob reference
- operator identity / automation identity
- target path
- intended rollback command or restore action

---

## 6. CI plan

CI should validate the monitoring project itself without requiring production mutation.

## 6.1 CI-verifiable checks

Recommended automated checks:

1. **path boundary tests**
   - only allow approved roots
   - deny secrets and disallowed directories
2. **permission model tests**
   - read-only collector cannot invoke write code paths
   - write-capable paths require explicit feature flag / auth gate
3. **sync preflight tests**
   - stale hash detection
   - conflict detection
   - rollback artifact generation
4. **markdown validation**
   - parseability / lint checks for modified fixtures
5. **config validation**
   - invalid allowlists or dangerous wildcards fail CI
6. **audit log tests**
   - every write-intent action emits structured audit event
7. **container / package build checks**
   - image builds reproducibly
   - startup succeeds with read-only mode enabled
8. **docs drift checks**
   - examples/config docs match actual defaults where possible

## 6.2 CI should explicitly avoid

- touching live OpenClaw runtime
- requiring real production secrets
- mutating real `claw_team` workspaces
- using write-enabled credentials in default PR CI

## 6.3 Suggested pipeline stages

1. lint
2. unit/integration tests
3. boundary-policy tests
4. build artifact/image
5. dry-run sync simulation
6. package docs / architecture artifact

---

## 7. Manual acceptance items

These should remain human-verified before broader rollout:

- monitored paths are sufficient for operator use cases
- no sensitive markdown or secret-adjacent files appear in UI
- read-only mode truly works under deployed runtime constraints
- future edit flow clearly displays source, diff, and rollback data
- rollback playbook is understandable by on-call operator
- deployment topology does not create hidden coupling with OpenClaw control paths

---

## 8. Major risks and mitigations

## Risk 1: monitor gains accidental write authority

**Impact:** broad filesystem or repo mutation risk

**Mitigation:**
- separate read and write identities
- default read-only runtime
- allowlist paths
- CI tests for denied write paths

## Risk 2: markdown sync overwrites newer human edits

**Impact:** content loss / coordination failure

**Mitigation:**
- optimistic locking by hash/SHA
- no silent auto-merge for semantic conflicts
- mandatory rollback artifact
- git-backed sync where possible

## Risk 3: sensitive files leak through broad path globs

**Impact:** secret exposure

**Mitigation:**
- denylist sensitive roots
- explicit root allowlists
- fixture tests for blocked paths
- UI redaction and path review during acceptance

## Risk 4: monitor becomes coupled to production runtime

**Impact:** monitor failure affects core system

**Mitigation:**
- separate process/container where possible
- snapshot/cache decoupling
- graceful degradation when upstream sources unavailable

## Risk 5: CI gives false confidence for sync logic

**Impact:** merge-ready code still unsafe in real environment

**Mitigation:**
- keep manual acceptance checklist
- require dry-run demonstrations
- stage write features behind feature flags and explicit approvals

---

## 9. Recommended implementation sequence

1. build phase-1 read-only collector and UI
2. add path allowlist and secret denylist tests
3. expose file metadata + content provenance labeling
4. add snapshot/cache model
5. design write-intent API separately
6. add staging/diff/rollback artifacts for future edits
7. gate sync/publish behind explicit approval workflow

---

## 10. Definition of done for this planning issue

This issue can be considered planned when the team agrees that:

- phase 1 is strictly read-only
- deployment relation with OpenClaw / claw_team is decoupled and explicit
- future edit/save/sync uses separate identities and audit trails
- conflict handling blocks silent overwrite
- CI covers policy/boundary checks, not live mutation
- rollback paths exist for both monitor runtime and later content writes
