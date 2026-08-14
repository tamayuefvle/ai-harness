import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runDiscoverDryRun } from "./ai-discover.mjs";
import { createDiscoverySession, loadDiscoverySession, sessionPath } from "./discovery-session-lib.mjs";
import { writePlanningDocs } from "./planning-doc-fixtures.mjs";
import { validateDiscoverySet } from "./product-lib.mjs";

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fixtureDiscoveryProject(tier = "full") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "discover-"));
  fs.mkdirSync(path.join(root, "harness/contracts"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/product"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "harness/project.json"),
    `${JSON.stringify({
      schemaVersion: "1.0.0",
      projectId: "demo-app",
      lifecycleMode: "full",
      state: "DISCOVERY",
      discoveryTier: tier,
      pendingApproval: null,
      decisionRefs: [],
      activeProfiles: [],
      profileResolutionPath: null,
      migration: null,
      history: [],
    }, null, 2)}\n`,
  );
  for (const file of ["product-discovery.json", "product-signal-feedback.json"]) {
    fs.copyFileSync(path.join(harnessRoot, "harness/contracts", file), path.join(root, "harness/contracts", file));
  }
  writePlanningDocs(root, [
    "docs/product/problem.md",
    "docs/product/users.md",
    "docs/product/outcomes.md",
    "docs/product/requirements.md",
  ]);
  return root;
}

test("createDiscoverySession writes schema-compatible artifact", () => {
  const root = fixtureDiscoveryProject();
  const session = createDiscoverySession(root);
  assert.match(session.sessionId, /^DISC-/);
  assert.equal(fs.existsSync(sessionPath(root, session.sessionId)), true);
  const loaded = loadDiscoverySession(root, session.sessionId);
  assert.equal(loaded.phase, "problem");
});

test("runDiscoverDryRun creates session with product check snapshot", () => {
  const root = fixtureDiscoveryProject();
  const result = runDiscoverDryRun(root);
  assert.match(result.sessionId, /^DISC-/);
  assert.equal(typeof result.productCheck.ok, "boolean");
  const session = loadDiscoverySession(root, result.sessionId);
  assert.equal(session.turns.length, 1);
  assert.ok(session.productCheckSnapshot);
});

test("validateDiscoverySet rejects fabrication claims without citation", () => {
  const root = fixtureDiscoveryProject("lite");
  fs.writeFileSync(
    path.join(root, "docs/product/problem.md"),
    `# Problem\n\n## Context\nUser research shows demand for a unified inbox.\n\n## Problem\nRequests are fragmented.\n`,
  );
  const result = validateDiscoverySet(root);
  assert.ok(result.errors.some((error) => error.includes("research-like claim")));
});

test("validateDiscoverySet rejects unvalidated assumption supporting Must", () => {
  const root = fixtureDiscoveryProject("full");
  fs.writeFileSync(
    path.join(root, "docs/product/requirements.md"),
    `# Requirements\n\n## Must\n\n- Capture requests quickly (OUT-001, ASM-001)\n`,
  );
  fs.writeFileSync(
    path.join(root, "docs/product/assumptions.md"),
    `# Assumptions\n\n| ID | Assumption | Status | Evidence | Supports |\n|---|---|---|---|---|\n| ASM-001 | Users want speed | unvalidated | pending | OUT-001 |\n`,
  );
  const result = validateDiscoverySet(root);
  assert.ok(result.errors.some((error) => error.includes("ASM-001")));
});

test("validateDiscoverySet rejects invalid assumption citation on research claim", () => {
  const root = fixtureDiscoveryProject("full");
  fs.writeFileSync(
    path.join(root, "docs/product/problem.md"),
    `# Problem\n\n## Context\nUser research shows demand [assumption:ASM-001].\n\n## Problem\nRequests are fragmented.\n`,
  );
  fs.writeFileSync(
    path.join(root, "docs/product/assumptions.md"),
    `# Assumptions\n\n| ID | Assumption | Status | Evidence | Supports |\n|---|---|---|---|---|\n| ASM-001 | Users want inbox | unvalidated | pending | OUT-001 |\n`,
  );
  const result = validateDiscoverySet(root);
  assert.ok(result.errors.some((error) => error.includes("ASM-001")));
});
