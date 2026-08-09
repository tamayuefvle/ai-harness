#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"; cd "$REPO_ROOT"
node scripts/harness/codex-preflight.mjs
HANDOFF_PATH="${1:-}"; [[ -f "$HANDOFF_PATH" ]] || { echo "Fallback handoff file is required." >&2; exit 2; }
node --input-type=module - "$HANDOFF_PATH" <<'NODE'
import path from "node:path";
import { claimDiagnosisAttempt } from "./scripts/harness/fallback-lib.mjs";
claimDiagnosisAttempt(process.cwd(), path.resolve(process.argv[2]));
NODE
META="$(node - "$HANDOFF_PATH" <<'NODE'
const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); process.stdout.write(`${j.taskId}\t${j.handoffId}`);
NODE
)"
IFS=$'\t' read -r TASK HANDOFF_ID <<< "$META"
REPORT_DIR=".harness/reports/$TASK/fallback"; mkdir -p "$REPORT_DIR"; REPORT_PATH="$REPORT_DIR/$HANDOFF_ID-decision.json"
if [[ -f "$REPORT_PATH" ]]; then
  echo "Fallback decision already exists for this handoff: $REPORT_PATH" >&2
  exit 1
fi
HANDOFF_DIGEST="$(node - "$HANDOFF_PATH" <<'NODE'
const fs=require("fs"),crypto=require("crypto"); process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(process.argv[2])).digest("hex"));
NODE
)"
PROMPT="$(cat harness/prompts/fallback-diagnose.md)

Fallback handoff packet: $HANDOFF_PATH
Read that packet and its referenced evidence before deciding.
Handoff SHA-256: $HANDOFF_DIGEST
Return this exact value as handoffDigest."
codex exec --ephemeral --sandbox read-only --output-schema harness/schemas/fallback-decision.schema.json -o "$REPORT_PATH" "$PROMPT"
node - "$HANDOFF_PATH" "$REPORT_PATH" <<'NODE'
const fs=require('fs'); const h=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); const d=JSON.parse(fs.readFileSync(process.argv[3],'utf8')); const crypto=require('crypto'); const digest=crypto.createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex'); if(d.handoffId!==h.handoffId||d.handoffDigest!==digest||d.repeatStrategy!==false) throw new Error('Invalid fallback decision binding'); if(d.decision==='alternative_strategy'&&(!d.materialDifference||!d.alternativeStrategy)) throw new Error('Alternative strategy is incomplete');
NODE
node --input-type=module - "$HANDOFF_PATH" <<'NODE'
import path from "node:path";
import { recordDiagnosisComplete } from "./scripts/harness/fallback-lib.mjs";
recordDiagnosisComplete(process.cwd(), path.resolve(process.argv[2]));
NODE
echo "Fallback decision: $REPORT_PATH"
