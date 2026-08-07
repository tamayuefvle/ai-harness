# ADR-0005: Capability Layer and CLI-based GitHub

Status: Accepted
Date: 2026-08-04

## Decision

Adopt a thin declarative Capability Layer without adding another workflow. Remove GitHub MCP and Context7 MCP. Use GitHub CLI with HTTPS, optional Context7 CLI only as documentation discovery, and retain Chrome DevTools MCP only as an optional Browser Capability provider. SDD principles strengthen existing specs; TDD remains internal to implementation.

## Consequences

Tool replacement no longer requires prompt-wide edits. Duplicate capabilities and sources of truth are explicitly rejected. GitHub writes are slower by design because they require proposal and human approval. Context7 outages cannot block normal work.
