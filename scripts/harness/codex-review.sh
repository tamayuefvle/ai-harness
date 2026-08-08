#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

node scripts/harness/codex-preflight.mjs

BASE_REF="${1:-origin/main}"
ACTIVE_SPEC="$(sed -n 's/^active_spec:[[:space:]]*//p' docs/specs/_active.md | head -n1)"
VERIFIED_HEAD="$(git rev-parse HEAD)"

if [[ -z "$ACTIVE_SPEC" || "$ACTIVE_SPEC" == "none" ]]; then
  echo "No active task." >&2
  exit 1
fi

REPORT_DIR=".harness/reports/$ACTIVE_SPEC"
REPORT_PATH="$REPORT_DIR/review.json"
VERIFICATION_REPORT="$REPORT_DIR/verification.json"
REVIEW_GITHUB_CONTEXT="$REPORT_DIR/github-context-review.json"
mkdir -p "$REPORT_DIR"

if [[ ! -f "$VERIFICATION_REPORT" ]]; then
  echo "Missing verification report: $VERIFICATION_REPORT" >&2
  exit 1
fi

node scripts/github/context.mjs \
  --task "$ACTIVE_SPEC" \
  --output "$REVIEW_GITHUB_CONTEXT"

PROMPT="$(cat harness/prompts/review.md)

Active task: $ACTIVE_SPEC
Active spec directory: docs/specs/$ACTIVE_SPEC
Base ref: $BASE_REF
Verified HEAD: $VERIFIED_HEAD
Verification report: $VERIFICATION_REPORT
GitHub context report: $REVIEW_GITHUB_CONTEXT
The git diff is provided on stdin."

git diff --no-ext-diff --unified=80 "${BASE_REF}...HEAD" \
  | codex exec \
      --ephemeral \
      --sandbox read-only \
      --output-schema harness/schemas/review.schema.json \
      -o "$REPORT_PATH" \
      "$PROMPT"

node scripts/harness/finalize-review-report.mjs "$REPORT_PATH" "$ACTIVE_SPEC" "$VERIFIED_HEAD"

node scripts/harness/record-delegation.mjs \
  reviewer completed "$ACTIVE_SPEC" read-only \
  "Independent review completed in a fresh ephemeral read-only Codex session." \
  "$REPORT_PATH"

echo "Review report: $REPORT_PATH"
