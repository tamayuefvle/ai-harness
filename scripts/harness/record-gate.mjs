import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireHuman } from "./full-lifecycle-lib.mjs";
import {
  assertCommit,
  assertNoUncommittedImplementationChanges,
  changedFiles,
  currentHead,
  deriveGitHubEvidence,
  deriveImplementationEvidence,
  deriveReactDoctorEvidence,
  deriveReviewEvidence,
  deriveVerificationEvidence,
  fingerprintChanges,
  git,
  loadGate,
  nowIso,
  designContractHash,
  designDocumentPath,
  reactDoctorRequired,
  readActive,
  resetDownstream,
  resolveEvidence,
  saveGate,
  scopeContractHash,
  assertScopeReadyContent,
  assertDesignReadyContent,
  validateTransition,
  verifyEvidence,
} from "./lifecycle-gates.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [rawAction, ...raw] = process.argv.slice(2);
const action = ({ "approve-spec": "confirm-scope", "approve-plan": "approve-design" })[rawAction] ?? rawAction;

function parseArgs(items) {
  const out = {};
  for (let i = 0; i < items.length; i += 1) {
    const token = items[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = items[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    out[key] = value;
    i += 1;
  }
  return out;
}

function requireText(args, key) {
  const value = args[key]?.trim();
  if (!value) throw new Error(`--${key} is required.`);
  return value;
}

function assertOptional(args, key, actual, parser = (value) => value) {
  if (args[key] === undefined) return;
  const expected = parser(args[key], key);
  if (expected !== actual) throw new Error(`--${key} conflicts with the validated artifact (${expected} != ${actual}).`);
}

function parseBoolean(value, key) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`--${key} must be true or false.`);
}

function parseInteger(value, key) {
  if (!/^[0-9]+$/.test(value ?? "")) throw new Error(`--${key} must be a non-negative integer.`);
  return Number(value);
}

function history(gate, actionName, actor, reason) {
  gate.history.push({ action: actionName, actor, reason, at: nowIso() });
}

try {
  const args = parseArgs(raw);
  const active = readActive(repoRoot);
  if (active.activeSpec === "none") throw new Error("No active task.");
  const { gate, gatePath } = loadGate(repoRoot, active.activeSpec);
  const actor = requireText(args, "by");
  const reason = requireText(args, "reason");

  if (action === "confirm-scope") {
    requireHuman(actor);
    if (active.status !== "DESIGNING") throw new Error("Scope confirmation is only valid in DESIGNING.");
    assertScopeReadyContent(repoRoot, active.activeSpec);
    gate.scopeApproval = { status: "approved", approvedBy: actor, approvedAt: nowIso(), reason, contractHash: scopeContractHash(repoRoot, active.activeSpec) };
    // Scope changes invalidate the design baseline and all downstream evidence.
    gate.designApproval = { status: "pending", approvedBy: null, approvedAt: null, reason: null, contractHash: null, baselineSha: null, designDocument: null };
    resetDownstream(gate, "implementation");
    history(gate, action, actor, reason);
  } else if (action === "approve-design") {
    requireHuman(actor);
    if (active.status !== "DESIGNING") throw new Error("Design approval is only valid in DESIGNING.");
    assertScopeReadyContent(repoRoot, active.activeSpec);
    assertDesignReadyContent(repoRoot, active.activeSpec);
    if (gate.scopeApproval.status !== "approved" || gate.scopeApproval.contractHash !== scopeContractHash(repoRoot, active.activeSpec)) {
      throw new Error("A fresh scope confirmation is required before design approval.");
    }
    const baselineSha = args["base-sha"] || currentHead(repoRoot);
    assertCommit(repoRoot, baselineSha);
    const designDocument = path.relative(repoRoot, designDocumentPath(repoRoot, active.activeSpec)).replaceAll("\\", "/");
    gate.designApproval = { status: "approved", approvedBy: actor, approvedAt: nowIso(), reason, contractHash: designContractHash(repoRoot, active.activeSpec), baselineSha, designDocument };
    resetDownstream(gate, "implementation");
    history(gate, action, actor, reason);
  } else if (action === "record-implementation") {
    if (active.status !== "DEVELOPING") throw new Error("Implementation evidence is only valid in DEVELOPING.");
    validateTransition(repoRoot, active.activeSpec, "DESIGNING", "DEVELOPING");
    if (git(repoRoot, ["status", "--porcelain"])) throw new Error("Worktree must be clean before recording implementation evidence.");
    const report = resolveEvidence(repoRoot, requireText(args, "report"));
    const derived = deriveImplementationEvidence(repoRoot, report.path, active.activeSpec);
    if (derived.report.design_baseline_hash !== gate.designApproval.contractHash) throw new Error("Implementation report design_baseline_hash does not match the approved design baseline.");
    assertOptional(args, "status", derived.status);
    gate.implementation = {
      status: derived.status,
      reportPath: report.path,
      reportSha256: report.sha256,
      changeFingerprint: fingerprintChanges(repoRoot, gate.designApproval.baselineSha, active.activeSpec),
      designBaselineHash: derived.report.design_baseline_hash,
      recordedAt: nowIso(),
    };
    history(gate, action, actor, reason);
  } else if (action === "record-verification") {
    if (active.status !== "VERIFYING") throw new Error("Verification evidence is only valid in VERIFYING.");
    validateTransition(repoRoot, active.activeSpec, "DEVELOPING", "VERIFYING");
    assertNoUncommittedImplementationChanges(repoRoot, active.activeSpec);
    const report = resolveEvidence(repoRoot, requireText(args, "report"));
    const derived = deriveVerificationEvidence(repoRoot, report.path, active.activeSpec);
    if (derived.headSha !== currentHead(repoRoot)) throw new Error("Verification report headSha must equal the current repository HEAD.");
    assertOptional(args, "status", derived.status);
    assertOptional(args, "preview-status", derived.previewStatus);
    assertOptional(args, "rollback-confirmed", derived.rollbackConfirmed, parseBoolean);

    const github = resolveEvidence(repoRoot, requireText(args, "github-context"));
    deriveGitHubEvidence(repoRoot, github.path, active.activeSpec, derived.headSha, { requirePassing: derived.status === "passed" });

    const files = changedFiles(repoRoot, gate.designApproval.baselineSha, active.activeSpec);
    const reactRequired = reactDoctorRequired(repoRoot, files);
    const react = args["react-doctor"] ? resolveEvidence(repoRoot, args["react-doctor"]) : null;
    if (reactRequired && !react && derived.status === "passed") throw new Error("--react-doctor is required for passing React-relevant changes.");
    if (react) deriveReactDoctorEvidence(repoRoot, react.path, active.activeSpec, derived.headSha, { requirePassing: derived.status === "passed" });

    gate.verification = {
      status: derived.status,
      reportPath: report.path,
      reportSha256: report.sha256,
      githubContextPath: github.path,
      githubContextSha256: github.sha256,
      reactDoctorPath: react?.path ?? null,
      reactDoctorSha256: react?.sha256 ?? null,
      previewStatus: derived.previewStatus,
      rollbackConfirmed: derived.rollbackConfirmed,
      headSha: derived.headSha,
      recordedAt: nowIso(),
    };
    history(gate, action, actor, reason);
  } else if (action === "record-review") {
    if (active.status !== "REVIEWING") throw new Error("Review evidence is only valid in REVIEWING.");
    validateTransition(repoRoot, active.activeSpec, "VERIFYING", "REVIEWING");
    assertNoUncommittedImplementationChanges(repoRoot, active.activeSpec);
    const report = resolveEvidence(repoRoot, requireText(args, "report"));
    const derived = deriveReviewEvidence(repoRoot, report.path, active.activeSpec, gate.verification.headSha, {
      verificationPath: gate.verification.reportPath,
      githubPath: `.harness/reports/${active.activeSpec}/github-context-review.json`,
      reactDoctorPath: gate.verification.reactDoctorPath,
    });
    assertOptional(args, "verdict", derived.verdict);
    assertOptional(args, "p0", derived.p0, parseInteger);
    assertOptional(args, "p1", derived.p1, parseInteger);
    assertOptional(args, "p2", derived.p2, parseInteger);
    const accepted = (args["accepted-p2-evidence"] ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((value) => resolveEvidence(repoRoot, value));
    gate.review = {
      status: "completed",
      verdict: derived.verdict,
      reportPath: report.path,
      reportSha256: report.sha256,
      p0: derived.p0,
      p1: derived.p1,
      p2: derived.p2,
      acceptedP2Evidence: accepted,
      recordedAt: nowIso(),
    };
    history(gate, action, actor, reason);
  } else if (action === "approve-release") {
    requireHuman(actor);
    if (active.status !== "REVIEWING") throw new Error("Release approval is only valid in REVIEWING.");
    validateTransition(repoRoot, active.activeSpec, "VERIFYING", "REVIEWING");
    assertNoUncommittedImplementationChanges(repoRoot, active.activeSpec);
    if (!new Set(["preview", "production"]).has(args.mode)) throw new Error("--mode must be preview or production.");
    verifyEvidence(repoRoot, gate.review.reportPath, gate.review.reportSha256, "Review");
    const review = deriveReviewEvidence(repoRoot, gate.review.reportPath, active.activeSpec, gate.verification.headSha, {
      verificationPath: gate.verification.reportPath,
      githubPath: `.harness/reports/${active.activeSpec}/github-context-review.json`,
      reactDoctorPath: gate.verification.reactDoctorPath,
    });
    if (review.verdict !== "approved" || review.p0 !== 0 || review.p1 !== 0) throw new Error("Release approval requires an approved review with zero P0/P1 findings.");
    if (review.p2 > 0 && gate.review.acceptedP2Evidence.length === 0) throw new Error("Release approval requires evidence for accepted P2 findings.");
    gate.releaseApproval = { status: "approved", approvedBy: actor, approvedAt: nowIso(), reason, contractHash: gate.review.reportSha256, mode: args.mode };
    history(gate, action, actor, reason);
  } else {
    throw new Error("Action must be confirm-scope, approve-design, record-implementation, record-verification, record-review, or approve-release.");
  }

  saveGate(gatePath, gate);
  console.log(JSON.stringify({ taskId: active.activeSpec, action, gate: path.relative(repoRoot, gatePath).replaceAll("\\", "/") }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
