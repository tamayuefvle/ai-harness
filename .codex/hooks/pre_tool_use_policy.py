#!/usr/bin/env python3
"""Deny destructive or policy-bypassing Codex tool calls."""

from __future__ import annotations

import json
import re
import sys
from typing import Any


DENY_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(^|\s)git\s+reset\s+--hard(\s|$)", re.I), "git reset --hard is forbidden."),
    (re.compile(r"(^|\s)git\s+clean\s+-[a-z]*f", re.I), "git clean with force is forbidden."),
    (re.compile(r"(^|\s)git\s+push\b[^\n;&|]*(--force|-f)(\s|$)", re.I), "Force push is forbidden."),
    (re.compile(r"(^|\s)rm\s+-[a-z]*r[a-z]*f|(^|\s)rm\s+-[a-z]*f[a-z]*r", re.I), "Recursive forced deletion is forbidden."),
    (re.compile(r"(^|\s)(npx\s+)?vercel\b[^\n;&|]*--prod(\s|$)", re.I), "Production deployment requires explicit human approval."),
    (re.compile(r"(^|\s)sudo(\s|$)", re.I), "sudo is outside the repository automation boundary."),
    (re.compile(r"(curl|wget)[^\n|]*\|\s*(ba)?sh(\s|$)", re.I), "Piping remote scripts into a shell is forbidden."),
    (re.compile(r"(^|\s)git\s+push(?:\s+\S+)?\s+(main|master)(\s|$)", re.I), "Direct push to the protected branch is forbidden."),
    (re.compile(r"(^|\s)git\s+push\b[^\n;&|]*HEAD:(main|master)(\s|$)", re.I), "Direct push to the protected branch is forbidden."),
    (re.compile(r"(^|\s)(cat|less|more|head|tail|sed|awk)\s+[^\n;&|]*\.env(?:\s|$)", re.I), "Reading a real .env file into model-visible output is forbidden."),
    (re.compile(r"(^|\s)(cat|less|more|head|tail)\s+[^\n;&|]*(id_rsa|id_ed25519|credentials)(\s|$)", re.I), "Reading credential files is forbidden."),
]


def deny(reason: str) -> None:
    payload = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }
    print(json.dumps(payload, ensure_ascii=False))
    raise SystemExit(0)


def flatten_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        result: list[str] = []
        for child in value.values():
            result.extend(flatten_strings(child))
        return result
    if isinstance(value, list):
        result: list[str] = []
        for child in value:
            result.extend(flatten_strings(child))
        return result
    return []


def main() -> None:
    try:
        event: dict[str, Any] = json.load(sys.stdin)
    except json.JSONDecodeError:
        deny("Hook input was invalid JSON; failing closed.")

    tool_input = event.get("tool_input") or {}
    visible_input = "\n".join(flatten_strings(tool_input)).replace("\\", "/")

    for pattern, reason in DENY_PATTERNS:
        if pattern.search(visible_input):
            deny(reason)

    if "harness/rules/" not in visible_input:
        if re.search(r"(^|/)(AGENTS\.md)(?:\s|$|[\"'])", visible_input):
            deny(
                "AGENTS.md files are generated. Edit harness/rules/*.md and run "
                "`npm run harness:generate` instead."
            )
        if "/.cursor/rules/" in visible_input or visible_input.startswith(".cursor/rules/"):
            deny(
                "Cursor rule files are generated. Edit harness/rules/*.md and run "
                "`npm run harness:generate` instead."
            )

    raise SystemExit(0)


if __name__ == "__main__":
    main()
