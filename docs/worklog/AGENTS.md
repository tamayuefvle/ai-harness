<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/rules/worklog.md; run npm run harness:generate -->
# Worklog contract

## Purpose

`docs/worklog/` is the canonical chronological record of meaningful development activity that is useful across sessions. It complements active specs and evidence reports; it does not replace either.

## Required behavior

- At the start of development work, read recent context with `npm run worklog:context` after `task:context`.
- At the end of meaningful work, append one concise entry with `npm run worklog:append -- ...`.
- Use local calendar dates for entry IDs and monthly files, and record both the IANA time-zone identifier and a UTC ISO 8601 timestamp.
- Record facts only: actor, task/spec, summary, decisions, files, evidence paths, verification, and next action.
- Never record secrets, tokens, personal data, raw external tool output, or generated report bodies.
- Evidence paths must be existing repository-relative files. `.harness/reports/` remains the evidence source; worklog entries reference evidence rather than duplicating it.
- Actor, task ID, verification value, length, control characters, Markdown/HTML structure, secret-like values, and paths are validated by the CLI.
- Generated `docs/worklog/AGENTS.md` and Cursor rules must not be edited directly.

## Correction contract

- Existing entries are immutable and append-only.
- A factual correction is a new entry created with `npm run worklog:correct -- ...`; it must reference the original entry ID, state the correction reason, and preserve the original bytes.
- Corrections require `--actor human` and an existing target entry. Agents may append activity entries but may not rewrite or correct history autonomously.

## Human and agent contract

Agents may append factual entries after work they actually performed. Humans may append correction entries. No entry may claim tests, review, deployment, or external writes that did not occur.

## Retrieval order

For prior-work questions, inspect: active spec → recent worklog context → matching worklog search → Git history/evidence reports as needed.
