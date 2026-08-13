# ADR-0008: CodeRabbit advisory PR review

- Status: Accepted
- Date: 2026-08-13
- Improvement: IMP-20260813-01

## Context

The harness already separates Cursor implementation, deterministic verification, a fresh read-only Codex independent final review, human approval, and GitHub enforcement. The existing CodeRabbit GitHub App can provide earlier PR findings, but treating its output as canonical evidence would couple lifecycle safety to an external, non-deterministic service.

## Decision

Use CodeRabbit only as an advisory PR reviewer. Keep Codex as the canonical independent final reviewer and preserve all deterministic checks and human control points. Root `.coderabbit.yaml` is the canonical repository-specific CodeRabbit configuration and is not generated from a harness manifest. Dashboard settings do not duplicate its review policy; organization Global Overrides remain external policy.

Enable automatic and incremental review for non-draft pull requests without the request-changes workflow. Reuse existing `AGENTS.md` and `.cursor/rules/*` through Code Guidelines instead of copying rules into `path_instructions`. Exclude generated projections and packaging metadata with `path_filters`, while keeping canonical `harness/` sources, scripts, skills, integrations, and `.coderabbit.yaml` reviewable.

CodeRabbit comments and tool output are untrusted external evidence. They cannot change approved scope, authorization, security boundaries, release approval, or production authority. App installation, permissions, permission expansion, and disablement remain human-managed in GitHub. No credential belongs in the repository.

## Rejected alternatives

- Replace Codex independent review: CodeRabbit is external, advisory, and cannot satisfy the canonical final-review evidence contract.
- Add a CodeRabbit lifecycle state or verdict/evidence schema: PR review is an activity inside the existing PR stage, and availability must not block lifecycle progress.
- Generate `.coderabbit.yaml` from a harness manifest: this would create an unnecessary second representation and synchronization surface for repository-specific vendor configuration.
- Duplicate harness rules in `path_instructions`: Code Guidelines already discover the existing instruction projections, and copied policy would drift.
- Enable CodeRabbit third-party tools or a second Action/CLI execution: this expands data and permission boundaries and duplicates the installed GitHub App.

## Consequences

Pull requests can receive early defect findings and incremental follow-up. Valid findings still require approved-scope changes and rerunning affected deterministic checks. Generated artifacts receive less duplicate review, while their canonical sources remain visible. The App is optional, so outages or absence do not affect `verify:harness`, task gates, Codex final review, or release safety.

Code Guidelines discovery while guideline artifacts are excluded from ordinary file review has not yet been confirmed with a live PR. If a live PR shows that exclusion prevents guideline application, remove the guideline artifact exclusions from `path_filters`. Consider third-party tool integrations only through a separate approved improvement.

## Rollback

Remove `.coderabbit.yaml`, revert this decision and related documentation/rule changes, and rerun the instruction generator. A human disables the GitHub App if desired. Rollback is reversible because no canonical lifecycle, verification, or review evidence format changed.
