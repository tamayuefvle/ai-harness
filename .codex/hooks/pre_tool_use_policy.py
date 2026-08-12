#!/usr/bin/env python3
"""Enforce the canonical command/tool guardrail policy for Codex PreToolUse."""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any


def repo_root() -> Path:
    configured = os.environ.get("HARNESS_REPO_ROOT")
    if configured:
        return Path(configured).resolve()
    here = Path(__file__).resolve()
    return here.parents[2]


def load_policy() -> dict[str, Any]:
    with (repo_root() / "harness/policies/command-guardrails.json").open(encoding="utf-8") as handle:
        return json.load(handle)


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

    policy = load_policy()
    tool_input = event.get("tool_input") or {}
    visible_input = "\n".join(flatten_strings(tool_input)).replace("\\", "/")

    for entry in policy["commandPatterns"]:
        if "codex-hook" not in entry["surfaces"]:
            continue
        flags = re.I if "i" in entry.get("flags", "") else 0
        if re.search(entry["regex"], visible_input, flags):
            deny(f'{entry["id"]}: {entry["message"]}')

    if "harness/rules/" not in visible_input:
        for marker in policy["generatedInstructionMarkers"]:
            if marker in visible_input:
                deny("POLICY-GENERATED-INSTRUCTION: edit canonical harness sources and regenerate projections instead.")

    raise SystemExit(0)


if __name__ == "__main__":
    main()
