import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runEvaluateStackDryRun } from "./ai-evaluate-stack.mjs";
import {
  applyDesignTurn,
  createDesignSession,
  designSessionPath,
  finalizeDesignSession,
  loadDesignSession,
  saveDesignSession,
} from "./design-session-lib.mjs";
import { writePlanningDocs } from "./planning-doc-fixtures.mjs";
import { sha256Files } from "./full-lifecycle-lib.mjs";

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fixtureDesignProject(state = "DESIGNING", approvedGates = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "design-session-"));
  fs.mkdirSync(path.join(root, "harness/contracts"), { recursive: true });
  fs.mkdirSync(path.join(root, "harness/lifecycle"), { recursive: true });
  fs.mkdirSync(path.join(root, "harness/profiles"), { recursive: true });
  fs.mkdirSync(path.join(root, "harness/prompts"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/product"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/architecture"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "harness/project.json"),
    `${JSON.stringify({
      schemaVersion: "2.0.0",
      projectId: "demo-app",
      lifecycleMode: "full",
      state,
      planningTier: "full",
      designTier: "full",
      phaseGates: Object.fromEntries(["planning","stack","architecture","design"].map((name)=>[name,{status:"pending",approvedBy:null,approvedAt:null,reason:null,contractHash:null}])),
      pendingApproval: null,
      decisionRefs: [],
      activeProfiles: [],
      profileResolutionPath: null,
      migration: null,
      history: [],
    }, null, 2)}\n`,
  );
  fs.copyFileSync(path.join(harnessRoot, "harness/lifecycle/manifest.json"), path.join(root, "harness/lifecycle/manifest.json"));
  fs.copyFileSync(
    path.join(harnessRoot, "harness/contracts/design-phase.json"),
    path.join(root, "harness/contracts/design-phase.json"),
  );
  fs.copyFileSync(
    path.join(harnessRoot, "harness/profiles/registry.json"),
    path.join(root, "harness/profiles/registry.json"),
  );
  for (const file of ["technology-evaluation.md", "architecture-baseline.md"]) {
    fs.copyFileSync(path.join(harnessRoot, "harness/prompts", file), path.join(root, "harness/prompts", file));
  }
  writePlanningDocs(root, [
    "docs/architecture/technology-options.md",
    "docs/architecture/technology-decision.md",
    "docs/product/outcomes.md",
    "docs/architecture/baseline.md",
    "docs/architecture/security-baseline.md",
    "docs/architecture/quality-strategy.md",
  ]);
  for (const [name, body] of [
    ["problem.md", "# Problem\n\nApproved product problem.\n"],
    ["users.md", "# Users\n\nApproved target users.\n"],
    ["requirements.md", "# Requirements\n\n## Must\n\n- Approved requirement (OUT-001)\n"],
  ]) fs.writeFileSync(path.join(root, "docs/product", name), body);
  if (state === "DESIGNING" && !approvedGates.includes("planning")) approvedGates = ["planning", ...approvedGates];
  if (approvedGates.length) {
    const projectFile=path.join(root,"harness/project.json");
    const project=JSON.parse(fs.readFileSync(projectFile,"utf8"));
    const manifest=JSON.parse(fs.readFileSync(path.join(root,"harness/lifecycle/manifest.json"),"utf8"));
    for (const name of approvedGates) {
      project.phaseGates[name]={status:"approved",approvedBy:"human:test",approvedAt:"2026-08-14T00:00:00.000Z",reason:"test",contractHash:sha256Files(root,manifest.projectGates[name].requiredDocuments)};
    }
    fs.writeFileSync(projectFile,`${JSON.stringify(project,null,2)}\n`);
  }
  return root;
}

test("createDesignSession rejects PLANNING", () => {
  const root = fixtureDesignProject("PLANNING");
  assert.throws(() => createDesignSession(root), /project state DESIGNING/);
});

test("createDesignSession writes DSN artifact in DESIGNING", () => {
  const root = fixtureDesignProject("DESIGNING");
  const session = createDesignSession(root);
  assert.match(session.sessionId, /^DSN-/);
  assert.equal(session.phase, "stack-options");
  assert.equal(fs.existsSync(designSessionPath(root, session.sessionId)), true);
});

test("runEvaluateStackDryRun snapshots stack:check without a live Codex provider", () => {
  const root = fixtureDesignProject("DESIGNING");
  const result = runEvaluateStackDryRun(root);
  assert.match(result.sessionId, /^DSN-/);
  assert.equal(result.checkSnapshot.kind, "stack");
  assert.equal(result.checkSnapshot.ok, false);
  const session = loadDesignSession(root, result.sessionId);
  assert.equal(session.turns.length, 1);
  assert.equal(session.turns[0].targetDocument, "docs/architecture/technology-options.md");
});

test("runEvaluateStackDryRun uses architecture check after stack approval", () => {
  const root = fixtureDesignProject("DESIGNING", ["stack"]);
  const result = runEvaluateStackDryRun(root);
  assert.equal(result.checkSnapshot.kind, "architecture");
  const session = loadDesignSession(root, result.sessionId);
  assert.equal(session.phase, "architecture");
});

test("createDesignSession rejects traversal and non-DSN ids", () => {
  const root = fixtureDesignProject("DESIGNING");
  assert.throws(() => createDesignSession(root, { sessionId: "../../harness/project" }), /Invalid design session id/);
  assert.throws(() => createDesignSession(root, { sessionId: "DSN-bad" }), /Invalid design session id/);
  assert.throws(() => designSessionPath(root, "/tmp/escape"), /Invalid design session id/);
  assert.equal(fs.existsSync(path.join(root, "harness/project.json")), true);
  const project = JSON.parse(fs.readFileSync(path.join(root, "harness/project.json"), "utf8"));
  assert.equal(project.state, "DESIGNING");
});

test("applyDesignTurn rejects malformed turns", () => {
  const root = fixtureDesignProject("DESIGNING");
  const session = createDesignSession(root);
  assert.throws(
    () => applyDesignTurn(session, { phase: "stack-options", rationale: "x" }),
    /targetDocument/,
  );
  assert.throws(
    () => applyDesignTurn(session, {
      mode: "publish",
      phase: "stack-options",
      targetDocument: "docs/product/problem.md",
      suggestedQuestion: "What runtime?",
      rationale: "Wrong file",
      openQuestions: [],
      fabricationRisk: "none",
    }),
    /targetDocument/,
  );
});

test("createDesignSession refuses to overwrite an existing session", () => {
  const root = fixtureDesignProject("DESIGNING");
  const session = createDesignSession(root, { sessionId: "DSN-20260813-abc123" });
  applyDesignTurn(session, {
    mode: "publish",
    phase: "stack-options",
    targetDocument: "docs/architecture/technology-options.md",
    suggestedQuestion: "Which outcomes constrain runtime?",
    rationale: "Keep the first recorded turn.",
    openQuestions: [],
    fabricationRisk: "none",
  });
  saveDesignSession(root, session);
  assert.throws(
    () => createDesignSession(root, { sessionId: "DSN-20260813-abc123" }),
    /already exists/,
  );
  assert.throws(
    () => createDesignSession(root, { sessionId: "DSN-20260813-abc123", overwrite: true }),
    /already exists/,
  );
  const loaded = loadDesignSession(root, "DSN-20260813-abc123");
  assert.equal(loaded.turns.length, 1);
});

test("finalizeDesignSession records a failed check without throwing", () => {
  const root = fixtureDesignProject("DESIGNING");
  const session = createDesignSession(root);
  const finalized = finalizeDesignSession(root, session.sessionId);
  assert.equal(finalized.checkSnapshot.ok, false);
  assert.equal(finalized.checkSnapshot.kind, "stack");
  const loaded = loadDesignSession(root, session.sessionId);
  assert.equal(loaded.checkSnapshot.ok, false);
});
