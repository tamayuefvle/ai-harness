#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

node scripts/harness/codex-preflight.mjs

PREP_JSON="$(node scripts/harness/ai-evaluate-stack.mjs --prepare)"
SESSION_ID="$(node -e 'const input=JSON.parse(process.argv[1]); process.stdout.write(input.sessionId);' "$PREP_JSON")"
TURN_OUTPUT="$(node -e 'const input=JSON.parse(process.argv[1]); process.stdout.write(input.turnOutput);' "$PREP_JSON")"
mkdir -p "$(dirname "$TURN_OUTPUT")"

PROMPT="$(node scripts/harness/ai-evaluate-stack.mjs --render-prompt --session "$SESSION_ID")"

codex exec \
  --ephemeral \
  --sandbox read-only \
  --output-schema harness/schemas/design-turn.schema.json \
  -o "$TURN_OUTPUT" \
  "$PROMPT"

node scripts/harness/ai-evaluate-stack.mjs --record --session "$SESSION_ID" --turn "$TURN_OUTPUT"
node scripts/harness/stack-check.mjs --if-applicable || true
node scripts/harness/architecture-check.mjs --if-applicable || true
node scripts/harness/ai-evaluate-stack.mjs --finalize --session "$SESSION_ID"

echo "Design session: .harness/design/${SESSION_ID}.json"
