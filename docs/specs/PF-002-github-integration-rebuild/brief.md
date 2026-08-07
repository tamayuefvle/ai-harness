# PF-002-github-integration-rebuild — GitHub integration rebuild

## Background

v6 made Docker GitHub MCP depend on a private PAT file because Cursor in WSL did
not reliably interpolate the PAT from `~/.cursor/mcp.json`. The MCP path was also
being used conceptually for evidence that should be deterministic and auditable.
ZIP extraction could remove Git hook execute permission, and React Doctor harness
tests were not part of the quality workflow.

## Goal

Rebuild the harness so GitHub CLI is the standard read-only GitHub evidence path,
Docker GitHub MCP is an optional OAuth exploration feature, secrets are not
managed by the harness, and local/CI verification covers Git hooks, GitHub
integration and React Doctor wrapper behavior.

## In scope

- canonical GitHub integration configuration and schemas
- fixed read-only `gh` context collector and doctor
- normalized report delivery to researcher and reviewer
- optional OAuth Docker GitHub MCP with read-only/lockdown/toolset limits
- removal of PAT-file launcher and default GitHub MCP configuration
- ZIP-safe Git hook installation
- harness tests and CI evidence upload
- ADR, setup, migration, rollback and change records

## Out of scope

- GitHub write operations
- automatic global Cursor/Codex configuration edits
- branch/ruleset changes
- production deployment
- arbitrary `gh api` forwarding
- registering a custom OAuth or GitHub App

## Approval record

- Approved by user: 2026-07-28
- Approved proposal: GitHub CLI standard gateway plus optional Docker OAuth MCP
- Improvement ID: `IMP-20260728-01`
