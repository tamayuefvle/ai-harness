# PF-003-public-instruction-safety — Public instruction boundary

## Background

The v7 rule manifest generated development instructions below `public/`. Static
asset frameworks can publish those files, exposing internal rules and creating a
runtime artifact from a harness control file.

## Goal

Keep the Public asset role canonical and available to both Codex and Cursor while
ensuring no harness instruction file is written below the public asset directory.

## In scope

- explicit AGENTS target composition in the rule generator
- root composition of the Public asset role
- global Cursor rule scoped by `public/**/*`
- synchronization-time rejection of public instruction files
- regression tests, ADR, workflow documentation and package records

## Out of scope

- application framework installation or application source generation
- application source, dependencies or lockfiles
- deployment configuration
- GitHub or MCP architecture

## Approval record

- Approved by user: 2026-07-28
- Improvement ID: `IMP-20260728-02`
