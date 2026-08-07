#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

ACCEPTANCE_ID="${1:-}"
if [[ ! "$ACCEPTANCE_ID" =~ ^AC-[0-9]{3,}$ ]]; then
  echo "Usage: npm run ai:implement -- AC-001" >&2
  exit 1
fi

ACTIVE_SPEC="$(sed -n 's/^active_spec:[[:space:]]*//p' docs/specs/_active.md | head -n1)"
STATUS="$(sed -n 's/^status:[[:space:]]*//p' docs/specs/_active.md | head -n1)"
BRANCH="$(git branch --show-current)"

if [[ -z "$ACTIVE_SPEC" || "$ACTIVE_SPEC" == "none" ]]; then
  echo "No active task." >&2
  exit 1
fi
if [[ "$STATUS" != "PLAN_READY" && "$STATUS" != "IMPLEMENTING" ]]; then
  echo "Codex implementation requires PLAN_READY or IMPLEMENTING; current: $STATUS" >&2
  exit 1
fi
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" || -z "$BRANCH" ]]; then
  echo "Codex implementation is forbidden on main/master or detached HEAD." >&2
  exit 1
fi
if ! grep -q "$ACCEPTANCE_ID" "docs/specs/$ACTIVE_SPEC/acceptance.md"; then
  echo "$ACCEPTANCE_ID is not present in the active acceptance criteria." >&2
  exit 1
fi

DECISION_JSON="$(node scripts/harness/codex-decision.mjs implementation)"
DECISION="$(printf '%s' "$DECISION_JSON" | node -e '
let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{
  const v=JSON.parse(s); process.stdout.write(v.decision);
});')"

if [[ "$DECISION" != "recommended" ]]; then
  echo "Codex implementation was not recommended. Decision: $DECISION" >&2
  printf '%s\n' "$DECISION_JSON" >&2
  exit 1
fi

REPORT_DIR=".harness/reports/$ACTIVE_SPEC"
REPORT_PATH="$REPORT_DIR/implementation-$ACCEPTANCE_ID.json"
BASELINE_PATH="$REPORT_DIR/implementation-$ACCEPTANCE_ID-baseline.txt"
mkdir -p "$REPORT_DIR"

{
  echo "branch=$BRANCH"
  echo "head=$(git rev-parse HEAD)"
  echo "--- git status --short ---"
  git status --short
  echo "--- existing diff names ---"
  git diff --name-only
} > "$BASELINE_PATH"

PROMPT="$(cat harness/prompts/implement.md)

Active task: $ACTIVE_SPEC
Acceptance criterion: $ACCEPTANCE_ID
Active spec directory: docs/specs/$ACTIVE_SPEC

Implement only $ACCEPTANCE_ID and return the structured report required by
harness/schemas/implementation.schema.json."

codex exec \
  -c mcp_servers.chrome_devtools.enabled=false \
  --ephemeral \
  --sandbox workspace-write \
  --output-schema harness/schemas/implementation.schema.json \
  -o "$REPORT_PATH" \
  "$PROMPT"

node scripts/harness/record-delegation.mjs \
  implementer completed "$ACCEPTANCE_ID" workspace-write \
  "Scoped implementation completed in a separate ephemeral Codex session." \
  "$REPORT_PATH"

echo "Implementation report: $REPORT_PATH"
echo "Cursor must now inspect the actual diff and run independent verification."
