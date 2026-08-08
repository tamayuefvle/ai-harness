#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

node scripts/harness/codex-preflight.mjs

ACTIVE_SPEC="$(sed -n 's/^active_spec:[[:space:]]*//p' docs/specs/_active.md | head -n1)"
STATUS="$(sed -n 's/^status:[[:space:]]*//p' docs/specs/_active.md | head -n1)"

if [[ -z "$ACTIVE_SPEC" || "$ACTIVE_SPEC" == "none" ]]; then
  echo "No active task." >&2
  exit 1
fi
if [[ "$STATUS" != "SPEC_READY" && "$STATUS" != "PLAN_READY" ]]; then
  echo "Codex research requires SPEC_READY or PLAN_READY; current: $STATUS" >&2
  exit 1
fi

REPORT_DIR=".harness/reports/$ACTIVE_SPEC"
REPORT_PATH="$REPORT_DIR/research.json"
mkdir -p "$REPORT_DIR"

node scripts/github/context.mjs \
  --task "$ACTIVE_SPEC" \
  --output "$REPORT_DIR/github-context.json"

PROMPT="$(cat harness/prompts/research.md)

Active task: $ACTIVE_SPEC
Active spec directory: docs/specs/$ACTIVE_SPEC
GitHub context report: $REPORT_DIR/github-context.json
Return the structured report required by harness/schemas/research.schema.json."

codex exec \
  --ephemeral \
  --sandbox read-only \
  --output-schema harness/schemas/research.schema.json \
  -o "$REPORT_PATH" \
  "$PROMPT"

node scripts/harness/record-delegation.mjs \
  researcher completed "$ACTIVE_SPEC" read-only \
  "Design research completed in an isolated read-only Codex session." \
  "$REPORT_PATH"

echo "Research report: $REPORT_PATH"
