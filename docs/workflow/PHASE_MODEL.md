# Phase model

v15 separates four concepts that were previously mixed together:

- **Phase** — what kind of work is happening now.
- **Gate** — what a human or deterministic check has approved or verified.
- **Artifact** — the canonical evidence or design being approved.
- **Agent** — the role and permissions allowed in the current phase.

A phase name is never used as a substitute for approval evidence. A gate record is never used as a substitute for the current phase.

## Project phases

```text
MIGRATION_PENDING
       │
       ├── greenfield ──> PLANNING ──[planning gate]──> DESIGNING ──[design gate]──> ACTIVE
       │                                      │
       │                                      ├── [stack gate]
       │                                      ├── [architecture gate]
       │                                      └── profile resolution
       │
       └── legacy migration with explicit human evidence ───────────────> ACTIVE

ACTIVE ──[human retirement decision]──> RETIRED
```

Project gates are independent records in `harness/project.json`:

| Gate | Phase | Canonical purpose |
|---|---|---|
| `planning` | `PLANNING` | approve Why / What product baseline |
| `stack` | `DESIGNING` | approve technology selection |
| `architecture` | `DESIGNING` | approve architecture/security/quality baseline |
| `design` | `DESIGNING` | approve complete project design plus resolved profiles |

`PLANNING → DESIGNING` requires a fresh planning gate. `DESIGNING → ACTIVE` requires a fresh design gate and, by design-gate validation, fresh planning, stack, and architecture gates plus a current resolved profile set. If product scope changes during Design, a human explicitly approves `DESIGNING → PLANNING`; advancing that transition clears all downstream project phase gates before Planning resumes.

## Task phases

```text
DESIGNING ──[scope + design approval]──> DEVELOPING
     ▲                                      │
     │                                      ▼
     └────────── design rework ───────── VERIFYING
                                             │
                                             ▼
                                         REVIEWING
                                             │
                                    [release approval]
                                             ▼
                                        DEPLOY_READY
                                             │
                                             ▼
                                            DONE
```

Task gate/evidence records are stored in `docs/specs/<TASK>/gate.json`:

| Record | Meaning |
|---|---|
| `scopeApproval` | human confirmation of `brief.md` + `acceptance.md` |
| `designApproval` | human approval of `design.md` (or legacy `plan.md`) + `test-plan.md`, bound to a baseline SHA and contract hash |
| `implementation` | implementation evidence bound to `design_baseline_hash` |
| `verification` | deterministic verification evidence for the current implementation |
| `review` | independent review evidence |
| `releaseApproval` | explicit human preview/production release approval |

New tasks use `design.md`. A migrated task may retain `plan.md`; the runtime resolves `design.md` first and treats `plan.md` only as a legacy design artifact.

## Phase ownership

| Phase | Human / Cursor focus | Codex use | Production-code writes |
|---|---|---|---|
| `PLANNING` | brainstorming, users, problem, outcomes, scope, requirements | optional read-only planning/research support | prohibited |
| `DESIGNING` (project) | stack, architecture, security, quality, profiles | optional read-only design research | prohibited |
| `DESIGNING` (task) | scope, exact behavior, API/data/UX, tests, implementation boundaries | optional read-only researcher | prohibited |
| `DEVELOPING` | execute approved design | bounded implementer when policy recommends it | allowed only within approved design |
| `VERIFYING` | deterministic checks and evidence | diagnosis only when explicitly routed | no speculative scope changes |
| `REVIEWING` | independent review and release decision support | read-only reviewer | prohibited by reviewer role |
| release / operations | existing release and incident contracts | bounded diagnostics | no autonomous production action |

## Rework rule

Implementation cannot silently resolve a missing product or design decision.

- implementation defect with unchanged approved design → remain in development/verification and fix it;
- missing or impossible design → `task:rework -- --target design ...`, clear design/downstream evidence, return to `DESIGNING`, re-approve, then rebaseline;
- product-scope change → leave the task design decision unresolved and return project Design to Planning with `npm run project:gate -- --to PLANNING --actor human:<name> --reason "..."`, then `npm run project:advance -- --to PLANNING`; this clears Planning/stack/architecture/design gates before re-planning.

## Canonical ownership

The lifecycle graph is owned by `harness/lifecycle/manifest.json`. Schemas own serialized contracts. Rules and Skills own agent behavior. Generated `AGENTS.md`, `CODEX.md`, `.cursor/rules`, `.cursor/skills`, policy projections, and `LIFECYCLE_REFERENCE.generated.md` must not be edited directly.
