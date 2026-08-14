import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  ACTIVE_STATES,
  currentHead,
  fingerprintChanges,
  normalizeRepoPath,
  parseAllowedPaths,
  reactDoctorRequired,
  resolveEvidence,
  planContractHash,
  specContractHash,
  saveGate,
  validateCompletion,
  validateTransition,
  verifyEvidence,
} from "./lifecycle-gates.mjs";

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-gates-"));
  fs.mkdirSync(path.join(root, "docs/specs/PF-001-example"), { recursive: true });
  execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Harness Test"], { cwd: root });
  fs.writeFileSync(path.join(root, "README.md"), "baseline\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync("git", ["commit", "-m", "baseline"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["switch", "-c", "feat/example"], { cwd: root, stdio: "ignore" });
  return root;
}

test("DONE is a terminal outcome, not an active state", () => {
  assert.deepEqual(ACTIVE_STATES, ["DESIGNING", "DEVELOPING", "VERIFYING", "REVIEWING", "DEPLOY_READY"]);
});

test("repository path normalization rejects traversal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "path-gate-"));
  assert.throws(() => normalizeRepoPath(root, "../secret"), /escapes repository root/);
  assert.equal(normalizeRepoPath(root, "./docs/report.json"), "docs/report.json");
});

test("allowed paths are parsed from the canonical plan section", () => {
  const plan = "# Plan\n\n### Allowed paths\n- `src`\n- tests/example.test.ts\n\n### Non-change scope\n- public\n";
  assert.deepEqual(parseAllowedPaths(plan), ["src", "tests/example.test.ts"]);
});

test("evidence digest detects content replacement", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-gate-"));
  fs.mkdirSync(path.join(root, "reports"));
  fs.writeFileSync(path.join(root, "reports/result.json"), "one\n");
  const evidence = resolveEvidence(root, "reports/result.json");
  verifyEvidence(root, evidence.path, evidence.sha256, "test");
  fs.writeFileSync(path.join(root, "reports/result.json"), "two\n");
  assert.throws(() => verifyEvidence(root, evidence.path, evidence.sha256, "test"), /changed after recording/);
});



test("evidence resolver rejects symlinked reports", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-symlink-"));
  fs.mkdirSync(path.join(root, "reports"));
  fs.writeFileSync(path.join(root, "real.json"), "{}\n");
  fs.symlinkSync(path.join(root, "real.json"), path.join(root, "reports/result.json"));
  assert.throws(() => resolveEvidence(root, "reports/result.json"), /cannot traverse a symlink/);
});

test("evidence resolver rejects reports reached through a symlinked parent directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-parent-symlink-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-parent-target-"));
  fs.writeFileSync(path.join(outside, "result.json"), "{}\n");
  fs.symlinkSync(outside, path.join(root, "reports"), "dir");
  assert.throws(() => resolveEvidence(root, "reports/result.json"), /cannot traverse a symlink/);
});

test("saveGate refuses schema-invalid lifecycle state", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "save-gate-"));
  assert.throws(() => saveGate(path.join(root, "gate.json"), { schemaVersion: "2.0.0" }), /Lifecycle gate failed JSON Schema validation/);
  assert.equal(fs.existsSync(path.join(root, "gate.json")), false);
});

test("approved gate records require complete human approval metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "approval-gate-"));
  const gate = JSON.parse(fs.readFileSync(new URL("../../docs/specs/TEMPLATE/gate.json", import.meta.url), "utf8"));
  gate.taskId = "PF-001-example";
  gate.scopeApproval = { status: "approved", approvedBy: null, approvedAt: null, reason: null, contractHash: "0".repeat(64) };
  assert.throws(() => saveGate(path.join(root, "gate.json"), gate), /approvedBy|approvedAt|reason/);
});

test("change fingerprint follows the approved baseline instead of current HEAD identity", () => {
  const root = tempRepo();
  const baseline = execFileSync("git", ["rev-parse", "main"], { cwd: root, encoding: "utf8" }).trim();
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src/example.ts"), "export const value = 1;\n");
  execFileSync("git", ["add", "src/example.ts"], { cwd: root });
  execFileSync("git", ["commit", "-m", "implementation"], { cwd: root, stdio: "ignore" });
  const first = fingerprintChanges(root, baseline, "PF-001-example");
  execFileSync("git", ["commit", "--allow-empty", "-m", "metadata commit"], { cwd: root, stdio: "ignore" });
  assert.equal(fingerprintChanges(root, baseline, "PF-001-example"), first);
});

test("spec contract hash changes when approved specification changes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spec-hash-"));
  const dir = path.join(root, "docs/specs/PF-001-example");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "brief.md"), "goal one\n");
  fs.writeFileSync(path.join(dir, "acceptance.md"), "| AC-001 | condition | Must | Pending | |\n");
  const before = specContractHash(root, "PF-001-example");
  fs.writeFileSync(path.join(dir, "brief.md"), "goal two\n");
  assert.notEqual(specContractHash(root, "PF-001-example"), before);
});


test("lifecycle metadata commits do not change the implementation fingerprint", () => {
  const root = tempRepo();
  const baseline = execFileSync("git", ["rev-parse", "main"], { cwd: root, encoding: "utf8" }).trim();
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src/example.ts"), "export const value = 1;\n");
  execFileSync("git", ["add", "src/example.ts"], { cwd: root });
  execFileSync("git", ["commit", "-m", "implementation"], { cwd: root, stdio: "ignore" });
  const before = fingerprintChanges(root, baseline, "PF-001-example");
  const specDir = path.join(root, "docs/specs/PF-001-example");
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, "gate.json"), "{}\n");
  fs.writeFileSync(path.join(specDir, "gate.v1.0.0.backup.json"), "{}\n");
  execFileSync("git", ["add", "docs/specs/PF-001-example/gate.json", "docs/specs/PF-001-example/gate.v1.0.0.backup.json"], { cwd: root });
  execFileSync("git", ["commit", "-m", "record evidence"], { cwd: root, stdio: "ignore" });
  assert.equal(fingerprintChanges(root, baseline, "PF-001-example"), before);
});

test("active spec pointer commits do not change the implementation fingerprint", () => {
  const root = tempRepo();
  const baseline = execFileSync("git", ["rev-parse", "main"], { cwd: root, encoding: "utf8" }).trim();
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src/example.ts"), "export const value = 1;\n");
  execFileSync("git", ["add", "src/example.ts"], { cwd: root });
  execFileSync("git", ["commit", "-m", "implementation"], { cwd: root, stdio: "ignore" });
  const before = fingerprintChanges(root, baseline, "PF-001-example");
  fs.mkdirSync(path.join(root, "docs/specs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs/specs/_active.md"),
    "---\nactive_spec: PF-001-example\nstatus: DEVELOPING\n---\n",
  );
  execFileSync("git", ["add", "docs/specs/_active.md"], { cwd: root });
  execFileSync("git", ["commit", "-m", "advance active status"], { cwd: root, stdio: "ignore" });
  assert.equal(fingerprintChanges(root, baseline, "PF-001-example"), before);
});


function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function lifecycleFixture() {
  const root = tempRepo();
  const taskId = "PF-001-example";
  const specDir = path.join(root, "docs/specs", taskId);

  fs.writeFileSync(path.join(specDir, "brief.md"), "# Brief\n\nGoal is observable.\n");
  fs.writeFileSync(path.join(specDir, "acceptance.md"), "| ID | Condition | Priority | Status | Evidence |\n|---|---|---|---|---|\n| AC-001 | Works | Must | Passed | .harness/reports/PF-001-example/verification.json |\n");
  fs.writeFileSync(path.join(specDir, "plan.md"), "# Plan\n\n## Existing capability decision\n- equivalent/overlapping/reusable/unrelated: unrelated\n- reuse/extend/replace/create: create\n\n### Allowed paths\n- `src`\n\n### Non-change scope\n- public\n\n### Dependencies\n- none\n\n## Test approach\n- verify AC-001\n\n## Rollback\n- revert the implementation commit\n");
  fs.writeFileSync(path.join(specDir, "test-plan.md"), "# Test plan\n\n- AC-001\n");
  fs.writeFileSync(path.join(specDir, "review.md"), "# Review\n");
  fs.writeFileSync(path.join(specDir, "delegation.md"), "# Delegation\n");
  execFileSync("git", ["add", `docs/specs/${taskId}`], { cwd: root });
  execFileSync("git", ["commit", "-m", "approved specification"], { cwd: root, stdio: "ignore" });
  const baseline = currentHead(root);

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/example.ts"), "export const value = 1;\n");
  execFileSync("git", ["add", "src/example.ts"], { cwd: root });
  execFileSync("git", ["commit", "-m", "implementation"], { cwd: root, stdio: "ignore" });
  const head = currentHead(root);

  const reportDir = path.join(root, ".harness/reports", taskId);
  fs.mkdirSync(reportDir, { recursive: true });
  writeJson(path.join(reportDir, "implementation.json"), {
    task_id: taskId,
    acceptance_id: "AC-001",
    status: "implemented",
    design_baseline_hash: planContractHash(root, taskId),
    summary: "Implemented",
    files_changed: [{ path: "src/example.ts", change: "added" }],
    commands_run: [{ command: "node --test", result: "pass", notes: "passed" }],
    test_discipline: {
      applicable: true,
      red_evidence: "Focused test failed before the change.",
      green_evidence: "Focused test passed after the change.",
      refactor: "not-needed",
      not_applicable_reason: null,
    },
    acceptance_evidence: [`.harness/reports/${taskId}/verification.json`],
    remaining_work: [],
    risks: [],
    scope_deviations: [],
  });
  writeJson(path.join(reportDir, "verification.json"), {
    schemaVersion: "1.0.0",
    taskId,
    status: "passed",
    summary: "All checks passed.",
    checks: [{ name: "unit", status: "passed", evidence: "node --test" }],
    preview: { status: "passed", reason: null },
    rollback: { confirmed: true, evidence: "Rollback reviewed." },
    headSha: head,
  });
  writeJson(path.join(reportDir, "github-context.json"), {
    schemaVersion: "1.1.0",
    reasonCode: null,
    generatedAt: "2026-08-05T00:00:00.000Z",
    taskId,
    status: "complete",
    source: { provider: "gh-cli", repoRoot: root, branch: "feat/example", headSha: head, commands: [] },
    repository: { nameWithOwner: "owner/repo", defaultBranch: "main", isPrivate: true, url: "https://github.com/owner/repo" },
    pullRequest: { number: 1, state: "OPEN", isDraft: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: "APPROVED", headRefName: "feat/example", baseRefName: "main", headRefOid: head, baseRefOid: baseline, updatedAt: "2026-08-05T00:00:00.000Z", url: "https://github.com/owner/repo/pull/1" },
    requiredChecks: [{ name: "quality", bucket: "pass", state: "SUCCESS", workflow: "Quality Gate", link: "https://example/check", startedAt: "2026-08-05T00:00:00.000Z", completedAt: "2026-08-05T00:01:00.000Z" }],
    recentRuns: [],
    untrustedContentIncluded: false,
    warnings: [],
    errors: [],
  });
  fs.copyFileSync(path.join(reportDir, "github-context.json"), path.join(reportDir, "github-context-review.json"));
  const verificationForReview = resolveEvidence(root, `.harness/reports/${taskId}/verification.json`);
  const githubForReview = resolveEvidence(root, `.harness/reports/${taskId}/github-context-review.json`);
  writeJson(path.join(reportDir, "review.json"), {
    schema_version: "1.0.0",
    task_id: taskId,
    head_sha: head,
    verdict: "approved",
    summary: "No blocking findings.",
    findings: [],
    unverified_areas: [],
    test_recommendations: [],
    diagnostic_evidence: [
      { tool: "verification", report: `.harness/reports/${taskId}/verification.json`, status: "passed", sha256: verificationForReview.sha256, reviewed: true, notes: "Reviewed." },
      { tool: "github", report: `.harness/reports/${taskId}/github-context-review.json`, status: "complete", sha256: githubForReview.sha256, reviewed: true, notes: "Reviewed." },
    ],
  });

  const implementation = resolveEvidence(root, `.harness/reports/${taskId}/implementation.json`);
  const verification = resolveEvidence(root, `.harness/reports/${taskId}/verification.json`);
  const github = resolveEvidence(root, `.harness/reports/${taskId}/github-context.json`);
  const review = resolveEvidence(root, `.harness/reports/${taskId}/review.json`);
  const gate = {
    schemaVersion: "2.0.0",
    taskId,
    scopeApproval: { status: "approved", approvedBy: "human:test", approvedAt: "2026-08-05T00:00:00.000Z", reason: "approved", contractHash: specContractHash(root, taskId) },
    designApproval: { status: "approved", approvedBy: "human:test", approvedAt: "2026-08-05T00:00:00.000Z", reason: "approved", contractHash: planContractHash(root, taskId), baselineSha: baseline, designDocument: `docs/specs/${taskId}/plan.md` },
    implementation: { status: "passed", reportPath: implementation.path, reportSha256: implementation.sha256, changeFingerprint: fingerprintChanges(root, baseline, taskId), designBaselineHash: planContractHash(root, taskId), recordedAt: "2026-08-05T00:00:00.000Z" },
    verification: { status: "passed", reportPath: verification.path, reportSha256: verification.sha256, githubContextPath: github.path, githubContextSha256: github.sha256, reactDoctorPath: null, reactDoctorSha256: null, previewStatus: "passed", rollbackConfirmed: true, headSha: head, recordedAt: "2026-08-05T00:00:00.000Z" },
    review: { status: "completed", verdict: "approved", reportPath: review.path, reportSha256: review.sha256, p0: 0, p1: 0, p2: 0, acceptedP2Evidence: [], recordedAt: "2026-08-05T00:00:00.000Z" },
    releaseApproval: { status: "approved", approvedBy: "human:test", approvedAt: "2026-08-05T00:00:00.000Z", reason: "release", contractHash: review.sha256, mode: "preview" },
    history: [],
  };
  writeJson(path.join(specDir, "gate.json"), gate);
  return { root, taskId, head, githubPath: path.join(reportDir, "github-context.json"), specDir, reportDir };
}

test("verification is bound to the exact observed HEAD", () => {
  const { root, taskId } = lifecycleFixture();
  validateTransition(root, taskId, "VERIFYING", "REVIEWING");
  execFileSync("git", ["commit", "--allow-empty", "-m", "post verification"], { cwd: root, stdio: "ignore" });
  assert.throws(() => validateTransition(root, taskId, "VERIFYING", "REVIEWING"), /HEAD changed after verification/);
});

test("completion revalidates all downstream evidence digests", () => {
  const { root, taskId, githubPath } = lifecycleFixture();
  validateCompletion(root, taskId);
  fs.writeFileSync(githubPath, '{"status":"replaced"}\n');
  assert.throws(() => validateCompletion(root, taskId), /GitHub context evidence changed after recording/);
});


test("completion rejects unparseable verification evidence even when its digest is recorded", () => {
  const { root, taskId, reportDir, specDir } = lifecycleFixture();
  const verificationPath = path.join(reportDir, "verification.json");
  fs.writeFileSync(verificationPath, "not-json\n");
  const evidence = resolveEvidence(root, `.harness/reports/${taskId}/verification.json`);
  const gatePath = path.join(specDir, "gate.json");
  const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  gate.verification.reportSha256 = evidence.sha256;
  writeJson(gatePath, gate);
  assert.throws(() => validateCompletion(root, taskId), /Verification report is not valid JSON/);
});

test("completion rejects failed verification disguised by a passed gate value", () => {
  const { root, taskId, head, reportDir, specDir } = lifecycleFixture();
  writeJson(path.join(reportDir, "verification.json"), {
    schemaVersion: "1.0.0",
    taskId,
    status: "failed",
    summary: "A deterministic check failed.",
    checks: [{ name: "unit", status: "failed", evidence: "node --test" }],
    preview: { status: "skipped", reason: "Verification failed first." },
    rollback: { confirmed: false, evidence: "Rollback not yet reviewed." },
    headSha: head,
  });
  const evidence = resolveEvidence(root, `.harness/reports/${taskId}/verification.json`);
  const gatePath = path.join(specDir, "gate.json");
  const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  gate.verification.reportSha256 = evidence.sha256;
  writeJson(gatePath, gate);
  assert.throws(() => validateCompletion(root, taskId), /Verification status gate value does not match/);
});

test("completion rejects a changes-requested review with blocking findings", () => {
  const { root, taskId, reportDir, specDir } = lifecycleFixture();
  const verificationForBlockingReview = resolveEvidence(root, `.harness/reports/${taskId}/verification.json`);
  const githubForBlockingReview = resolveEvidence(root, `.harness/reports/${taskId}/github-context-review.json`);
  writeJson(path.join(reportDir, "review.json"), {
    schema_version: "1.0.0",
    task_id: taskId,
    head_sha: currentHead(root),
    verdict: "changes_requested",
    summary: "Blocking issue found.",
    findings: [{ severity: "P0", file: "src/example.ts", line: 1, title: "Unsafe", evidence: "Observed", impact: "Release blocker", recommendation: "Fix it" }],
    unverified_areas: [],
    test_recommendations: [],
    diagnostic_evidence: [
      { tool: "verification", report: `.harness/reports/${taskId}/verification.json`, status: "passed", sha256: verificationForBlockingReview.sha256, reviewed: true, notes: "Blocking evidence reviewed." },
      { tool: "github", report: `.harness/reports/${taskId}/github-context-review.json`, status: "complete", sha256: githubForBlockingReview.sha256, reviewed: true, notes: "Reviewed." },
    ],
  });
  const evidence = resolveEvidence(root, `.harness/reports/${taskId}/review.json`);
  const gatePath = path.join(specDir, "gate.json");
  const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  gate.review.reportSha256 = evidence.sha256;
  gate.releaseApproval.contractHash = evidence.sha256;
  writeJson(gatePath, gate);
  assert.throws(() => validateCompletion(root, taskId), /Review verdict gate value does not match/);
});

test("completion revalidates approved specification and plan hashes", () => {
  const { root, taskId, specDir } = lifecycleFixture();
  fs.appendFileSync(path.join(specDir, "brief.md"), "\nUnapproved scope expansion.\n");
  assert.throws(() => validateCompletion(root, taskId), /Specification changed after approval|stale/);
});

test("completion rejects schema-invalid gate files", () => {
  const { root, taskId, specDir } = lifecycleFixture();
  const gatePath = path.join(specDir, "gate.json");
  const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  delete gate.verification.reportPath;
  writeJson(gatePath, gate);
  assert.throws(() => validateCompletion(root, taskId), /Lifecycle gate failed JSON Schema validation/);
});

test("completion rejects failed required GitHub checks even with a matching digest", () => {
  const { root, taskId, reportDir, specDir } = lifecycleFixture();
  const githubPath = path.join(reportDir, "github-context.json");
  const github = JSON.parse(fs.readFileSync(githubPath, "utf8"));
  github.requiredChecks[0].bucket = "fail";
  github.requiredChecks[0].state = "FAILURE";
  writeJson(githubPath, github);
  const evidence = resolveEvidence(root, `.harness/reports/${taskId}/github-context.json`);
  const gatePath = path.join(specDir, "gate.json");
  const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  gate.verification.githubContextSha256 = evidence.sha256;
  writeJson(gatePath, gate);
  assert.throws(() => validateCompletion(root, taskId), /GitHub context is not release-ready/);
});

test("React Doctor requirement is derived from repository dependencies and changed files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "react-requirement-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { react: "19.0.0" } }));
  assert.equal(reactDoctorRequired(root, ["src/component.tsx"]), true);
  assert.equal(reactDoctorRequired(root, ["README.md"]), false);
});


test("completion rejects uncommitted implementation changes outside lifecycle metadata", () => {
  const { root, taskId } = lifecycleFixture();
  fs.writeFileSync(path.join(root, "src/uncommitted.ts"), "export const unsafe = true;\n");
  assert.throws(() => validateCompletion(root, taskId), /Uncommitted implementation changes/);
});

test("completion binds independent review to the verified task and HEAD", () => {
  const { root, taskId, reportDir, specDir } = lifecycleFixture();
  const reviewPath = path.join(reportDir, "review.json");
  const reviewReport = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  reviewReport.head_sha = "f".repeat(40);
  writeJson(reviewPath, reviewReport);
  const evidence = resolveEvidence(root, `.harness/reports/${taskId}/review.json`);
  const gatePath = path.join(specDir, "gate.json");
  const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  gate.review.reportSha256 = evidence.sha256;
  gate.releaseApproval.contractHash = evidence.sha256;
  writeJson(gatePath, gate);
  assert.throws(() => validateCompletion(root, taskId), /Review report HEAD does not match verified HEAD/);
});


test("completion rejects review diagnostic evidence replaced after finalization", () => {
  const { root, taskId, reportDir, specDir } = lifecycleFixture();
  const reviewPath = path.join(reportDir, "review.json");
  const reviewReport = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  reviewReport.diagnostic_evidence[0].sha256 = "0".repeat(64);
  writeJson(reviewPath, reviewReport);
  const evidence = resolveEvidence(root, `.harness/reports/${taskId}/review.json`);
  const gatePath = path.join(specDir, "gate.json");
  const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  gate.review.reportSha256 = evidence.sha256;
  gate.releaseApproval.contractHash = evidence.sha256;
  writeJson(gatePath, gate);
  assert.throws(() => validateCompletion(root, taskId), /Review diagnostic .* evidence changed after recording/);
});

test("completion requires verification evidence in the independent review", () => {
  const { root, taskId, reportDir, specDir, githubPath } = lifecycleFixture();
  const reviewPath = path.join(reportDir, "review.json");
  const reviewReport = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  const github = resolveEvidence(root, `.harness/reports/${taskId}/github-context-review.json`);
  reviewReport.diagnostic_evidence = [{ tool: "github", report: `.harness/reports/${taskId}/github-context-review.json`, status: "complete", sha256: github.sha256, reviewed: true, notes: "Reviewed." }];
  writeJson(reviewPath, reviewReport);
  const evidence = resolveEvidence(root, `.harness/reports/${taskId}/review.json`);
  const gatePath = path.join(specDir, "gate.json");
  const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  gate.review.reportSha256 = evidence.sha256;
  gate.releaseApproval.contractHash = evidence.sha256;
  writeJson(gatePath, gate);
  assert.equal(fs.existsSync(githubPath), true);
  assert.throws(() => validateCompletion(root, taskId), /must include finalized verification.json/);
});

test("review transition replays implementation evidence before accepting verification", () => {
  const { root, taskId, reportDir } = lifecycleFixture();
  fs.writeFileSync(path.join(reportDir, "implementation.json"), "not-json\n");
  assert.throws(() => validateTransition(root, taskId, "VERIFYING", "REVIEWING"), /Implementation evidence changed after recording/);
});

test("deploy transition replays verification evidence before accepting review", () => {
  const { root, taskId, reportDir } = lifecycleFixture();
  fs.appendFileSync(path.join(reportDir, "verification.json"), "\n");
  assert.throws(() => validateTransition(root, taskId, "REVIEWING", "DEPLOY_READY"), /Verification evidence changed after recording/);
});

test("completion requires GitHub context in the independent review", () => {
  const { root, taskId, reportDir, specDir } = lifecycleFixture();
  const reviewPath = path.join(reportDir, "review.json");
  const reviewReport = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  reviewReport.diagnostic_evidence = reviewReport.diagnostic_evidence.filter((item) => path.basename(item.report) === "verification.json");
  writeJson(reviewPath, reviewReport);
  const evidence = resolveEvidence(root, `.harness/reports/${taskId}/review.json`);
  const gatePath = path.join(specDir, "gate.json");
  const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  gate.review.reportSha256 = evidence.sha256;
  gate.releaseApproval.contractHash = evidence.sha256;
  writeJson(gatePath, gate);
  assert.throws(() => validateCompletion(root, taskId), /must include finalized GitHub context/);
});
