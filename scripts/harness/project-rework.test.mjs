import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runProjectGate } from "./project-gate.mjs";
import { advanceProject } from "./project-advance.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-rework-"));
  fs.mkdirSync(path.join(root, "harness/lifecycle"), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, "harness/lifecycle/manifest.json"), path.join(root, "harness/lifecycle/manifest.json"));
  const approved = () => ({ status: "approved", approvedBy: "human:test", approvedAt: "2026-08-14T00:00:00.000Z", reason: "old approval", contractHash: "a".repeat(64) });
  fs.writeFileSync(path.join(root, "harness/project.json"), `${JSON.stringify({
    schemaVersion: "2.0.0",
    projectId: "demo-project",
    lifecycleMode: "full",
    state: "DESIGNING",
    planningTier: "full",
    designTier: "full",
    phaseGates: { planning: approved(), stack: approved(), architecture: approved(), design: approved() },
    pendingApproval: null,
    decisionRefs: [],
    activeProfiles: [],
    proposedProfiles: [],
    profileResolutionPath: null,
    migration: null,
    history: [],
    activeDesignSession: "DSN-20260814-abcdef",
  }, null, 2)}\n`);
  return root;
}

test("project design can explicitly return to planning and invalidates downstream phase gates", () => {
  const root = fixture();
  runProjectGate(root, { to: "PLANNING", actor: "human:owner", reason: "product scope decision changed" });
  const result = advanceProject(root, { to: "PLANNING" });
  const project = JSON.parse(fs.readFileSync(path.join(root, "harness/project.json"), "utf8"));

  assert.equal(result.from, "DESIGNING");
  assert.equal(project.state, "PLANNING");
  assert.equal(project.activeDesignSession, undefined);
  for (const gate of Object.values(project.phaseGates)) assert.equal(gate.status, "pending");
  assert.equal(project.history.at(-1).actor, "human:owner");
});
