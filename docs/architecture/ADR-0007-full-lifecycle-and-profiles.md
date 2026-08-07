# ADR-0007: Hierarchical full lifecycle and technology profiles

- Status: Accepted
- Date: 2026-08-06
- Improvement: IMP-20260806-02

## Context

v10.1.1 has reusable delivery gates but binds execution, CI, rules, and diagnostics to the Next.js/React/npm portfolio stack. Product discovery and post-release outcomes are not first-class state or evidence.

## Decision

Use one repository and one harness with four coordinated state machines: project, task, release, and incident. Keep the v10 task lifecycle compatible. Define lifecycle state in `harness/lifecycle/manifest.json`. Represent technology as composable, approved profiles. Operational signals produce proposals rather than direct edits. Production authority remains outside the agent and is protected by explicit human approval and hosting/GitHub controls.

## Rejected alternatives

- One giant linear state machine: mixes long-lived project state with short-lived tasks.
- Separate planning/development/operations harness repositories: duplicates policies and weakens traceability.
- Fully automatic stack detection and installation: creates hidden decisions and unsafe external changes.

## Consequences

Migration and additional schemas are required. The current Next.js stack becomes a profile set rather than a universal default. Existing task gate schema 1.1.0 remains valid.
