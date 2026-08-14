import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildMigratedGate, migrateLegacyGate, migratedTaskState } from "./migrate-gates.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const template = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs/specs/TEMPLATE/gate.json"), "utf8"));

test("legacy gate migration preserves history and resets downstream evidence under schema 2", () => {
  const existing = {
    schemaVersion: "1.0.0",
    history: [{ action: "old", actor: "human", reason: "old", at: "2026-08-04T00:00:00.000Z" }],
    implementation: { status: "passed" },
    verification: { status: "passed" },
    review: { verdict: "approved" },
  };
  const gate = buildMigratedGate({
    template,
    existingGate: existing,
    taskId: "PF-001-example",
    actor: "human:tama",
    reason: "upgrade",
    baselineSha: "a".repeat(40),
    scopeHash: "b".repeat(64),
    designHash: "c".repeat(64),
    designDocument: "docs/specs/PF-001-example/plan.md",
    at: "2026-08-05T00:00:00.000Z",
  });
  assert.equal(gate.schemaVersion, "2.0.0");
  assert.equal(gate.scopeApproval.contractHash, "b".repeat(64));
  assert.equal(gate.designApproval.contractHash, "c".repeat(64));
  assert.equal(gate.designApproval.designDocument, "docs/specs/PF-001-example/plan.md");
  assert.equal(gate.implementation.status, "pending");
  assert.equal(gate.verification.status, "pending");
  assert.equal(gate.review.status, "pending");
  assert.equal(gate.releaseApproval.status, "pending");
  assert.equal(gate.history[0].action, "old");
  assert.equal(gate.history.at(-1).action, "v15-phase-gate-migration");
  assert.equal(gate.history.at(-1).fromSchemaVersion, "1.0.0");
});


test("legacy task states restart at a v15 state consistent with reset evidence", () => {
  for (const state of ["IDEA", "SPEC_READY", "PLAN_READY"]) assert.equal(migratedTaskState(state), "DESIGNING");
  for (const state of ["IMPLEMENTING", "VERIFYING", "REVIEW_READY", "DEPLOY_READY"]) assert.equal(migratedTaskState(state), "DEVELOPING");
  assert.throws(() => migratedTaskState("DONE"), /should not remain active/);
  assert.throws(() => migratedTaskState("REVIEWING"), /already uses the v15 lifecycle/);
});


test("legacy task migration validates design, backs up state, and restarts downstream work at DEVELOPING", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "v15-task-migrate-"));
  const taskId = "PF-001-example";
  const taskDir = path.join(root, "docs/specs", taskId);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.mkdirSync(path.join(root, "docs/specs/TEMPLATE"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "docs/specs/TEMPLATE/gate.json"), path.join(root, "docs/specs/TEMPLATE/gate.json"));
  fs.writeFileSync(path.join(root, "docs/specs/_active.md"), `---\nactive_spec: ${taskId}\nstatus: VERIFYING\nupdated_at: 2026-08-01\n---\n`);
  fs.writeFileSync(path.join(taskDir, "brief.md"), "# Brief\n\nImplement the approved behavior.\n");
  fs.writeFileSync(path.join(taskDir, "acceptance.md"), "| ID | Condition | Priority | Status | Evidence |\n|---|---|---|---|---|\n| AC-001 | Works | Must | Pending | |\n");
  fs.writeFileSync(path.join(taskDir, "plan.md"), `# Legacy design\n\nEquivalent/overlapping/reusable/unrelated: reusable\n\nReuse/extend/replace/create: extend\n\n### Allowed paths\n- src\n\n### Non-change scope\n- public API\n\n### Dependencies\n- none\n\n## Test approach\n- AC-001 unit test\n\n## Rollback\n- revert the implementation commit\n`);
  fs.writeFileSync(path.join(taskDir, "test-plan.md"), "# Test plan\n\n- AC-001: unit test\n");
  fs.writeFileSync(path.join(taskDir, "gate.json"), JSON.stringify({ schemaVersion: "1.1.0", history: [{ action: "old", actor: "human:owner", reason: "old approval", at: "2026-08-01T00:00:00.000Z" }] }, null, 2));

  execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Harness Test"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-m", "legacy task"], { cwd: root, stdio: "ignore" });
  const baseline = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

  const result = migrateLegacyGate(root, ["--approved-by", "human:owner", "--reason", "reviewed for v15", "--base-sha", baseline]);
  const active = fs.readFileSync(path.join(root, "docs/specs/_active.md"), "utf8");
  const gate = JSON.parse(fs.readFileSync(path.join(taskDir, "gate.json"), "utf8"));

  assert.equal(result.previousStatus, "VERIFYING");
  assert.equal(result.status, "DEVELOPING");
  assert.match(active, /status: DEVELOPING/);
  assert.ok(fs.existsSync(path.join(root, "docs/specs/_active.v14.backup.md")));
  assert.ok(fs.existsSync(path.join(taskDir, "gate.v1.1.0.backup.json")));
  assert.equal(gate.scopeApproval.approvedBy, "human:owner");
  assert.equal(gate.designApproval.baselineSha, baseline);
  assert.equal(gate.designApproval.designDocument, `docs/specs/${taskId}/plan.md`);
  assert.equal(gate.implementation.status, "pending");
  assert.equal(gate.verification.status, "pending");
  assert.equal(gate.review.status, "pending");
});
