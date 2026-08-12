import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { utcTimestamp } from "./time.mjs";
import { findReactManifests, isRelevantReactFile } from "./react-doctor.mjs";
import {
  validateGate,
  validateGitHubContextArtifact,
  validateImplementationArtifact,
  validateReactDoctorArtifact,
  validateReviewArtifact,
  validateVerificationArtifact,
} from "./artifact-validator.mjs";

const canonicalRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lifecycleManifest = JSON.parse(fs.readFileSync(path.join(canonicalRepoRoot, "harness/lifecycle/manifest.json"), "utf8"));
export const ACTIVE_STATES = Object.freeze([...lifecycleManifest.lifecycles.task.activeStates]);

export function nowIso() {
  return utcTimestamp();
}

export function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

export function normalizeRepoPath(repoRoot, input) {
  if (!input || typeof input !== "string") throw new Error("A repository-relative path is required.");
  const normalized = input.replaceAll("\\", "/").replace(/^\.\//, "");
  const absolute = path.resolve(repoRoot, normalized);
  const relative = path.relative(repoRoot, absolute).replaceAll("\\", "/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes repository root: ${input}`);
  }
  return relative;
}

export function resolveRepositoryFile(repoRoot, input, label = "Evidence file") {
  const normalized = normalizeRepoPath(repoRoot, input);
  const absolute = path.join(repoRoot, normalized);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`${label} does not exist: ${normalized}`);
  }
  let cursor = repoRoot;
  for (const component of normalized.split("/")) {
    cursor = path.join(cursor, component);
    if (fs.lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`${label} cannot traverse a symlink: ${normalized}`);
    }
  }
  const realRoot = fs.realpathSync(repoRoot);
  const realFile = fs.realpathSync(absolute);
  const realRelative = path.relative(realRoot, realFile);
  if (!realRelative || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    throw new Error(`${label} resolves outside repository root: ${normalized}`);
  }
  return { path: normalized, absolute };
}

export function resolveEvidence(repoRoot, relativePath) {
  const resolved = resolveRepositoryFile(repoRoot, relativePath);
  return { path: resolved.path, sha256: sha256File(resolved.absolute) };
}

export function git(repoRoot, args, options = {}) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

export function currentHead(repoRoot) {
  return git(repoRoot, ["rev-parse", "HEAD"]);
}

export function currentBranch(repoRoot) {
  return git(repoRoot, ["branch", "--show-current"]);
}

export function assertCommit(repoRoot, sha) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error(`Invalid commit SHA: ${sha}`);
  git(repoRoot, ["rev-parse", "--verify", `${sha}^{commit}`]);
}

export function readActive(repoRoot) {
  const activePath = path.join(repoRoot, "docs/specs/_active.md");
  const text = fs.readFileSync(activePath, "utf8");
  return {
    activePath,
    text,
    activeSpec: text.match(/active_spec:\s*(\S+)/)?.[1] ?? "none",
    status: text.match(/status:\s*(\S+)/)?.[1] ?? "UNKNOWN",
  };
}

export function specPaths(repoRoot, taskId) {
  const specDir = path.join(repoRoot, "docs/specs", taskId);
  return {
    specDir,
    gatePath: path.join(specDir, "gate.json"),
    brief: path.join(specDir, "brief.md"),
    acceptance: path.join(specDir, "acceptance.md"),
    plan: path.join(specDir, "plan.md"),
    testPlan: path.join(specDir, "test-plan.md"),
    review: path.join(specDir, "review.md"),
    delegation: path.join(specDir, "delegation.md"),
  };
}

export function loadGate(repoRoot, taskId) {
  const { gatePath } = specPaths(repoRoot, taskId);
  if (!fs.existsSync(gatePath)) throw new Error(`Missing lifecycle gate: docs/specs/${taskId}/gate.json`);
  let gate;
  try {
    gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  } catch (error) {
    throw new Error(`Lifecycle gate is not valid JSON: ${error.message}`);
  }
  validateGate(gate);
  if (gate.taskId !== taskId) throw new Error(`gate.json taskId mismatch: ${gate.taskId} != ${taskId}`);
  return { gate, gatePath };
}

export function saveGate(gatePath, gate) {
  validateGate(gate);
  fs.writeFileSync(gatePath, `${JSON.stringify(gate, null, 2)}\n`, "utf8");
}

export function hashFiles(files) {
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    if (!fs.existsSync(file)) throw new Error(`Required contract file missing: ${file}`);
    hash.update(path.basename(file));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function specContractHash(repoRoot, taskId) {
  const p = specPaths(repoRoot, taskId);
  return hashFiles([p.brief, p.acceptance]);
}

export function planContractHash(repoRoot, taskId) {
  const p = specPaths(repoRoot, taskId);
  return hashFiles([p.brief, p.acceptance, p.plan, p.testPlan]);
}

export function parseAllowedPaths(planText) {
  const match = planText.match(/### Allowed paths\s*\n([\s\S]*?)(?=\n### |\n## |$)/i);
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^`|`$/g, "").trim())
    .filter(Boolean);
}

function isLifecycleMetadata(file, taskId) {
  if (file === "docs/specs/_active.md") return true;
  if (file.startsWith(".harness/reports/") || file.startsWith("docs/worklog/")) return true;
  if (!taskId) return false;
  return new Set([
    `docs/specs/${taskId}/gate.json`,
    `docs/specs/${taskId}/gate.v1.0.0.backup.json`,
    `docs/specs/${taskId}/review.md`,
    `docs/specs/${taskId}/delegation.md`,
    `docs/specs/${taskId}/DONE.md`,
  ]).has(file);
}

export function changedFiles(repoRoot, baselineSha, taskId = null) {
  assertCommit(repoRoot, baselineSha);
  const out = git(repoRoot, ["diff", "--name-only", `${baselineSha}...HEAD`]);
  return (out ? out.split(/\r?\n/).filter(Boolean) : []).filter((file) => !isLifecycleMetadata(file, taskId));
}


export function uncommittedFiles(repoRoot) {
  const files = new Set();
  for (const args of [
    ["diff", "--name-only"],
    ["diff", "--cached", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"],
  ]) {
    const output = git(repoRoot, args);
    for (const file of output.split(/\r?\n/).filter(Boolean)) files.add(file.replaceAll("\\", "/"));
  }
  return [...files].sort();
}

export function assertNoUncommittedImplementationChanges(repoRoot, taskId) {
  const unsafe = uncommittedFiles(repoRoot).filter((file) => !isLifecycleMetadata(file, taskId) && file !== "docs/specs/_active.md");
  if (unsafe.length) throw new Error(`Uncommitted implementation changes are not allowed at this gate: ${unsafe.join(", ")}`);
}
export function fingerprintChanges(repoRoot, baselineSha, taskId = null) {
  assertCommit(repoRoot, baselineSha);
  const files = changedFiles(repoRoot, baselineSha, taskId);
  if (files.length === 0) return sha256Buffer(Buffer.from(""));
  const diff = git(repoRoot, ["diff", "--binary", `${baselineSha}...HEAD`, "--", ...files]);
  return sha256Buffer(Buffer.from(diff));
}

export function assertAllowedChanges(repoRoot, taskId, baselineSha) {
  const p = specPaths(repoRoot, taskId);
  const allowed = parseAllowedPaths(fs.readFileSync(p.plan, "utf8"));
  if (allowed.length === 0) throw new Error("plan.md must contain at least one bullet under '### Allowed paths'.");
  const files = changedFiles(repoRoot, baselineSha, taskId);
  if (files.length === 0) throw new Error("No implementation changes found from the approved baseline.");
  const violations = files.filter((file) => !allowed.some((entry) => file === entry || file.startsWith(`${entry.replace(/\/$/, "")}/`)));
  if (violations.length) throw new Error(`Changes outside approved paths: ${violations.join(", ")}`);
  for (const file of files) {
    const abs = path.join(repoRoot, file);
    if (fs.existsSync(abs) && fs.lstatSync(abs).isSymbolicLink()) throw new Error(`Symlink change is not allowed: ${file}`);
  }
  return files;
}

export function validateImplementationReport(repoRoot, relativePath, taskId) {
  const normalized = normalizeRepoPath(repoRoot, relativePath);
  const absolute = path.join(repoRoot, normalized);
  return validateImplementationArtifact(absolute, taskId).report;
}

export function deriveImplementationEvidence(repoRoot, relativePath, taskId) {
  const normalized = normalizeRepoPath(repoRoot, relativePath);
  return validateImplementationArtifact(path.join(repoRoot, normalized), taskId);
}

export function deriveVerificationEvidence(repoRoot, relativePath, taskId) {
  const normalized = normalizeRepoPath(repoRoot, relativePath);
  return validateVerificationArtifact(path.join(repoRoot, normalized), taskId);
}

export function deriveGitHubEvidence(repoRoot, relativePath, taskId, expectedHead, options) {
  const normalized = normalizeRepoPath(repoRoot, relativePath);
  return validateGitHubContextArtifact(path.join(repoRoot, normalized), taskId, expectedHead, options);
}

export function deriveReactDoctorEvidence(repoRoot, relativePath, taskId, expectedHead, options) {
  const normalized = normalizeRepoPath(repoRoot, relativePath);
  return validateReactDoctorArtifact(path.join(repoRoot, normalized), taskId, expectedHead, options);
}

export function deriveReviewEvidence(repoRoot, relativePath, taskId, expectedHead, {
  verificationPath = null,
  githubPath = null,
  reactDoctorPath = null,
} = {}) {
  const normalized = normalizeRepoPath(repoRoot, relativePath);
  const review = validateReviewArtifact(path.join(repoRoot, normalized), taskId, expectedHead);
  const requiredVerification = verificationPath ? normalizeRepoPath(repoRoot, verificationPath) : null;
  const requiredGitHub = githubPath ? normalizeRepoPath(repoRoot, githubPath) : null;
  const requiredReactDoctor = reactDoctorPath ? normalizeRepoPath(repoRoot, reactDoctorPath) : null;
  let verificationReviewed = false;
  let githubReviewed = false;
  let reactDoctorReviewed = false;
  for (const item of review.report.diagnostic_evidence) {
    if (!/^[0-9a-f]{64}$/.test(item.sha256 ?? "")) {
      throw new Error(`Review diagnostic evidence is missing a finalized digest: ${item.report}`);
    }
    const evidence = verifyEvidence(repoRoot, item.report, item.sha256, `Review diagnostic (${item.tool})`);
    const absolute = path.join(repoRoot, evidence.path);
    const base = path.basename(evidence.path);
    if (base === "verification.json") {
      if (requiredVerification && evidence.path !== requiredVerification) throw new Error(`Review cited the wrong verification report: ${evidence.path}`);
      verificationReviewed = true;
      const diagnostic = validateVerificationArtifact(absolute, taskId);
      if (item.status !== diagnostic.report.status) throw new Error(`Review diagnostic status does not match verification report: ${item.report}`);
      if (diagnostic.headSha !== expectedHead) throw new Error("Review diagnostic verification HEAD does not match verified HEAD.");
      if (review.verdict === "approved" && diagnostic.status !== "passed") throw new Error("Approved review requires passing verification evidence.");
    } else if (/^github-context(?:-[^/]+)?\.json$/.test(base)) {
      if (requiredGitHub && evidence.path !== requiredGitHub) throw new Error(`Review cited the wrong GitHub context report: ${evidence.path}`);
      githubReviewed = true;
      const diagnostic = validateGitHubContextArtifact(absolute, taskId, expectedHead, { requirePassing: review.verdict === "approved" });
      if (item.status !== diagnostic.report.status) throw new Error(`Review diagnostic status does not match GitHub context: ${item.report}`);
    } else if (/^react-doctor-(?!.*\.raw\.json$).+\.json$/.test(base)) {
      if (requiredReactDoctor && evidence.path !== requiredReactDoctor) throw new Error(`Review cited the wrong React Doctor report: ${evidence.path}`);
      reactDoctorReviewed = true;
      const diagnostic = validateReactDoctorArtifact(absolute, taskId, expectedHead, { requirePassing: review.verdict === "approved" });
      if (item.status !== diagnostic.report.result.status) throw new Error(`Review diagnostic status does not match React Doctor report: ${item.report}`);
    }
  }
  if (!verificationReviewed) throw new Error("Review must include finalized verification.json diagnostic evidence.");
  if (requiredGitHub && !githubReviewed) throw new Error("Review must include finalized GitHub context diagnostic evidence.");
  if (requiredReactDoctor && !reactDoctorReviewed) throw new Error("Review must include finalized React Doctor diagnostic evidence.");
  return { ...review, verificationReviewed, githubReviewed, reactDoctorReviewed };
}

export function verifyEvidence(repoRoot, relativePath, expectedSha, label) {
  if (!relativePath || !expectedSha) throw new Error(`${label} evidence is incomplete.`);
  const current = resolveEvidence(repoRoot, relativePath);
  if (current.sha256 !== expectedSha) throw new Error(`${label} evidence changed after recording: ${current.path}`);
  return current;
}

function tableRows(markdown) {
  return markdown.split(/\r?\n/).filter((line) => /^\|/.test(line)).map((line) => line.split("|").slice(1, -1).map((v) => v.trim()));
}

export function assertMustAcceptanceComplete(repoRoot, taskId) {
  const text = fs.readFileSync(specPaths(repoRoot, taskId).acceptance, "utf8");
  const rows = tableRows(text).filter((row) => /^AC-\d+$/i.test(row[0] ?? ""));
  const must = rows.filter((row) => (row[2] ?? "").toLowerCase() === "must");
  if (must.length === 0) throw new Error("At least one Must acceptance criterion is required.");
  const incomplete = must.filter((row) => !/^(passed|complete|done)$/i.test(row[3] ?? "") || !(row[4] ?? "").trim());
  if (incomplete.length) throw new Error(`Must acceptance criteria lack completed status/evidence: ${incomplete.map((r) => r[0]).join(", ")}`);
}

export function assertSpecReadyContent(repoRoot, taskId) {
  const p = specPaths(repoRoot, taskId);
  for (const file of [p.brief, p.acceptance]) {
    const text = fs.readFileSync(file, "utf8");
    if (/{{[^}]+}}/.test(text)) throw new Error(`Unresolved template marker in ${path.basename(file)}`);
  }
  const acceptance = fs.readFileSync(p.acceptance, "utf8");
  if (!/\|\s*AC-\d+\s*\|/i.test(acceptance) || !/\|\s*Must\s*\|/i.test(acceptance)) {
    throw new Error("acceptance.md must contain at least one observable Must AC.");
  }
}

export function assertPlanReadyContent(repoRoot, taskId) {
  const p = specPaths(repoRoot, taskId);
  const plan = fs.readFileSync(p.plan, "utf8");
  const testPlan = fs.readFileSync(p.testPlan, "utf8");
  const required = [
    /equivalent\/overlapping\/reusable\/unrelated/i,
    /reuse\/extend\/replace\/create/i,
    /### Allowed paths/i,
    /### Non-change scope/i,
    /### Dependencies/i,
    /## Test approach/i,
    /## Rollback/i,
  ];
  for (const pattern of required) if (!pattern.test(plan)) throw new Error(`plan.md is missing required contract section: ${pattern}`);
  if (parseAllowedPaths(plan).length === 0) throw new Error("plan.md Allowed paths must contain at least one bullet.");
  if (!/AC-\d+/i.test(testPlan)) throw new Error("test-plan.md must map verification to acceptance criteria.");
}

function assertApprovedContracts(repoRoot, taskId, gate) {
  if (gate.specApproval.status !== "approved" || gate.specApproval.contractHash !== specContractHash(repoRoot, taskId)) {
    throw new Error("Approved specification is stale or missing.");
  }
  if (gate.planApproval.status !== "approved" || gate.planApproval.contractHash !== planContractHash(repoRoot, taskId)) {
    throw new Error("Approved plan is stale or missing.");
  }
  assertCommit(repoRoot, gate.planApproval.baselineSha);
}

export function reactDoctorRequired(repoRoot, files) {
  return findReactManifests(repoRoot).length > 0 && files.some((file) => isRelevantReactFile(file));
}


function assertDerivedGateValue(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} gate value does not match the recorded artifact.`);
}

export function validateTransition(repoRoot, taskId, current, requested) {
  const { gate } = loadGate(repoRoot, taskId);
  if (requested === "SPEC_READY") {
    assertSpecReadyContent(repoRoot, taskId);
    if (gate.specApproval.status !== "approved") throw new Error("Specification approval is required.");
    if (gate.specApproval.contractHash !== specContractHash(repoRoot, taskId)) throw new Error("Specification changed after approval.");
  } else if (requested === "PLAN_READY") {
    assertSpecReadyContent(repoRoot, taskId);
    assertPlanReadyContent(repoRoot, taskId);
    assertApprovedContracts(repoRoot, taskId, gate);
  } else if (requested === "IMPLEMENTING") {
    assertSpecReadyContent(repoRoot, taskId);
    assertPlanReadyContent(repoRoot, taskId);
    assertApprovedContracts(repoRoot, taskId, gate);
    const branch = currentBranch(repoRoot);
    if (!branch || ["main", "master"].includes(branch)) throw new Error("Implementation requires a non-protected feature branch.");
  } else if (requested === "VERIFYING") {
    assertApprovedContracts(repoRoot, taskId, gate);
    assertNoUncommittedImplementationChanges(repoRoot, taskId);
    verifyEvidence(repoRoot, gate.implementation.reportPath, gate.implementation.reportSha256, "Implementation");
    const implementation = deriveImplementationEvidence(repoRoot, gate.implementation.reportPath, taskId);
    assertDerivedGateValue(gate.implementation.status, implementation.status, "Implementation status");
    if (implementation.status !== "passed") throw new Error("Passed implementation evidence is required.");
    const files = assertAllowedChanges(repoRoot, taskId, gate.planApproval.baselineSha);
    const currentFingerprint = fingerprintChanges(repoRoot, gate.planApproval.baselineSha, taskId);
    if (currentFingerprint !== gate.implementation.changeFingerprint) throw new Error("Implementation change set differs from recorded evidence.");
    if (reactDoctorRequired(repoRoot, files) && !gate.verification.reactDoctorPath && gate.verification.status !== "pending") {
      throw new Error("React Doctor evidence is required for React-relevant changes.");
    }
  } else if (requested === "REVIEW_READY") {
    validateTransition(repoRoot, taskId, "IMPLEMENTING", "VERIFYING");
    assertApprovedContracts(repoRoot, taskId, gate);
    assertNoUncommittedImplementationChanges(repoRoot, taskId);
    verifyEvidence(repoRoot, gate.verification.reportPath, gate.verification.reportSha256, "Verification");
    const verification = deriveVerificationEvidence(repoRoot, gate.verification.reportPath, taskId);
    assertDerivedGateValue(gate.verification.status, verification.status, "Verification status");
    assertDerivedGateValue(gate.verification.previewStatus, verification.previewStatus, "Preview status");
    assertDerivedGateValue(gate.verification.rollbackConfirmed, verification.rollbackConfirmed, "Rollback confirmation");
    assertDerivedGateValue(gate.verification.headSha, verification.headSha, "Verification HEAD");
    if (verification.status !== "passed") throw new Error("Passed verification evidence is required.");
    verifyEvidence(repoRoot, gate.verification.githubContextPath, gate.verification.githubContextSha256, "GitHub context");
    deriveGitHubEvidence(repoRoot, gate.verification.githubContextPath, taskId, verification.headSha, { requirePassing: true });
    const files = changedFiles(repoRoot, gate.planApproval.baselineSha, taskId);
    const needsReactDoctor = reactDoctorRequired(repoRoot, files);
    if (needsReactDoctor && !gate.verification.reactDoctorPath) throw new Error("React Doctor evidence is required for React-relevant changes.");
    if (gate.verification.reactDoctorPath) {
      verifyEvidence(repoRoot, gate.verification.reactDoctorPath, gate.verification.reactDoctorSha256, "React Doctor");
      deriveReactDoctorEvidence(repoRoot, gate.verification.reactDoctorPath, taskId, verification.headSha, { requirePassing: true });
    }
    if (currentHead(repoRoot) !== verification.headSha) throw new Error("Repository HEAD changed after verification evidence was recorded.");
    if (fingerprintChanges(repoRoot, gate.planApproval.baselineSha, taskId) !== gate.implementation.changeFingerprint) throw new Error("Implementation changed after verification.");
  } else if (requested === "DEPLOY_READY") {
    validateTransition(repoRoot, taskId, "VERIFYING", "REVIEW_READY");
    assertApprovedContracts(repoRoot, taskId, gate);
    assertNoUncommittedImplementationChanges(repoRoot, taskId);
    verifyEvidence(repoRoot, gate.review.reportPath, gate.review.reportSha256, "Review");
    const review = deriveReviewEvidence(repoRoot, gate.review.reportPath, taskId, gate.verification.headSha, {
      verificationPath: gate.verification.reportPath,
      githubPath: `.harness/reports/${taskId}/github-context-review.json`,
      reactDoctorPath: gate.verification.reactDoctorPath,
    });
    assertDerivedGateValue(gate.review.verdict, review.verdict, "Review verdict");
    assertDerivedGateValue(gate.review.p0, review.p0, "Review P0 count");
    assertDerivedGateValue(gate.review.p1, review.p1, "Review P1 count");
    assertDerivedGateValue(gate.review.p2, review.p2, "Review P2 count");
    if (gate.review.status !== "completed" || review.verdict !== "approved") throw new Error("Approved independent review is required.");
    if (review.p0 !== 0 || review.p1 !== 0) throw new Error("P0/P1 findings must be zero.");
    if (review.p2 > 0 && gate.review.acceptedP2Evidence.length === 0) throw new Error("Accepted P2 findings require recorded evidence.");
    for (const evidence of gate.review.acceptedP2Evidence) verifyEvidence(repoRoot, evidence.path, evidence.sha256, "Accepted P2");
    if (gate.releaseApproval.status !== "approved") throw new Error("Human release approval is required.");
    if (gate.releaseApproval.contractHash !== gate.review.reportSha256) throw new Error("Release approval is stale for the current review evidence.");
  } else {
    throw new Error(`No validator for transition ${current} -> ${requested}`);
  }
}

export function validateCompletion(repoRoot, taskId) {
  const { gate } = loadGate(repoRoot, taskId);
  assertMustAcceptanceComplete(repoRoot, taskId);
  validateTransition(repoRoot, taskId, "IDEA", "SPEC_READY");
  validateTransition(repoRoot, taskId, "SPEC_READY", "PLAN_READY");
  validateTransition(repoRoot, taskId, "PLAN_READY", "IMPLEMENTING");
  validateTransition(repoRoot, taskId, "IMPLEMENTING", "VERIFYING");
  validateTransition(repoRoot, taskId, "VERIFYING", "REVIEW_READY");
  validateTransition(repoRoot, taskId, "REVIEW_READY", "DEPLOY_READY");
  return gate;
}

export function resetDownstream(gate, from) {
  const order = ["implementation", "verification", "review", "releaseApproval"];
  const start = order.indexOf(from);
  for (const key of order.slice(Math.max(start, 0))) {
    if (key === "implementation") gate.implementation = { status: "pending", reportPath: null, reportSha256: null, changeFingerprint: null, recordedAt: null };
    if (key === "verification") gate.verification = { status: "pending", reportPath: null, reportSha256: null, githubContextPath: null, githubContextSha256: null, reactDoctorPath: null, reactDoctorSha256: null, previewStatus: "pending", rollbackConfirmed: false, headSha: null, recordedAt: null };
    if (key === "review") gate.review = { status: "pending", verdict: null, reportPath: null, reportSha256: null, p0: 0, p1: 0, p2: 0, acceptedP2Evidence: [], recordedAt: null };
    if (key === "releaseApproval") gate.releaseApproval = { status: "pending", approvedBy: null, approvedAt: null, reason: null, contractHash: null, mode: null };
  }
}
