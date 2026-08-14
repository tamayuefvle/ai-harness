#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

node scripts/harness/codex-preflight.mjs

ACCEPTANCE_ID="${1:-}"
FALLBACK_DECISION="${2:-}"
if [[ ! "$ACCEPTANCE_ID" =~ ^AC-[0-9]{3,}$ ]]; then
  echo "Usage: npm run ai:implement -- AC-001 [fallback-decision.json]" >&2
  exit 1
fi

ACTIVE_SPEC="$(sed -n 's/^active_spec:[[:space:]]*//p' docs/specs/_active.md | head -n1)"
STATUS="$(sed -n 's/^status:[[:space:]]*//p' docs/specs/_active.md | head -n1)"
BRANCH="$(git branch --show-current)"

if [[ -z "$ACTIVE_SPEC" || "$ACTIVE_SPEC" == "none" ]]; then
  echo "No active task." >&2
  exit 1
fi
if [[ "$STATUS" != "DEVELOPING" ]]; then
  echo "Codex implementation requires DEVELOPING; current: $STATUS" >&2
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

FALLBACK_CONTEXT=""
if [[ -n "$FALLBACK_DECISION" ]]; then
  [[ -f "$FALLBACK_DECISION" ]] || { echo "Fallback decision not found: $FALLBACK_DECISION" >&2; exit 1; }
  FALLBACK_META="$(node scripts/harness/fallback-validate-implementation.mjs "$FALLBACK_DECISION" "$ACTIVE_SPEC" "$ACCEPTANCE_ID")"
  node --input-type=module - "$FALLBACK_DECISION" <<'NODE'
import path from "node:path";
import { recordImplementationAttempt } from "./scripts/harness/fallback-lib.mjs";
recordImplementationAttempt(process.cwd(), path.resolve(process.argv[2]), { outcome: "started" });
NODE
  FALLBACK_CONTEXT="$(printf '%s' "$FALLBACK_META" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const v=JSON.parse(s);console.log(`Fallback handoff: ${v.handoffPath}\nMaterial difference: ${v.materialDifference}\nRequired alternative strategy: ${v.alternativeStrategy}\nDo not repeat the failed Cursor strategy.`)})')"
else
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
harness/schemas/implementation.schema.json.

$FALLBACK_CONTEXT"

write_fallback_human_handoff() {
  local reason="$1"
  HUMAN_PATH="${FALLBACK_DECISION%-decision.json}-human.json"
  node - "$FALLBACK_DECISION" "$HUMAN_PATH" "$reason" <<'NODE'
const fs=require('fs'); const [decisionPath,out,reason]=process.argv.slice(2); const d=JSON.parse(fs.readFileSync(decisionPath,'utf8'));
const human={schemaVersion:'1.0.0',handoffId:d.handoffId,handoffDigest:d.handoffDigest,decision:'human_action',cursorFailureAssessment:d.cursorFailureAssessment,failureClass:d.failureClass,repeatStrategy:false,reasoningSummary:reason,materialDifference:null,alternativeStrategy:null,humanRequest:'Please inspect the preserved Cursor/Codex failure evidence and either perform the required manual action or provide a new explicit strategy/decision.',resumeCondition:'A human action or decision is recorded and the resulting repository/external state is verified read-only before a new run resumes.'};
fs.writeFileSync(out,JSON.stringify(human,null,2)+'\n');
NODE
  node --input-type=module - "$HUMAN_PATH" <<'NODE'
import { parseJsonArtifact } from "./scripts/harness/artifact-validator.mjs"; parseJsonArtifact(process.argv[2],"fallbackDecision","Human fallback handoff");
NODE
  node --input-type=module - "$FALLBACK_DECISION" <<'NODE'
import path from "node:path";
import { recordHumanHandoff } from "./scripts/harness/fallback-lib.mjs";
recordHumanHandoff(process.cwd(), path.resolve(process.argv[2]));
NODE
  echo "Autonomous fallback is exhausted. Human handoff: $HUMAN_PATH" >&2
}

set +e
codex exec \
  --ephemeral \
  --sandbox workspace-write \
  --output-schema harness/schemas/implementation.schema.json \
  -o "$REPORT_PATH" \
  "$PROMPT"
CODEX_STATUS=$?
set -e
if [[ $CODEX_STATUS -ne 0 ]]; then
  if [[ -n "$FALLBACK_DECISION" ]]; then
    write_fallback_human_handoff "The one permitted materially different Codex implementation strategy failed to execute; autonomous executor fallback is exhausted."
  fi
  exit "$CODEX_STATUS"
fi

if [[ -n "$FALLBACK_DECISION" ]]; then
  if ! node --input-type=module - "$REPORT_PATH" "$ACTIVE_SPEC" <<'NODE'
import { validateImplementationArtifact } from "./scripts/harness/artifact-validator.mjs";
const result=validateImplementationArtifact(process.argv[2],process.argv[3]);
if(result.status!=="passed") process.exit(1);
NODE
  then
    write_fallback_human_handoff "The one permitted materially different Codex implementation strategy returned incomplete, blocked, unverified, or scope-deviating implementation evidence; autonomous executor fallback is exhausted."
    exit 1
  fi
fi

node scripts/harness/record-delegation.mjs \
  implementer completed "$ACCEPTANCE_ID" workspace-write \
  "Scoped implementation completed in a separate ephemeral Codex session." \
  "$REPORT_PATH"

echo "Implementation report: $REPORT_PATH"
echo "Cursor must now inspect the actual diff and run independent verification."
