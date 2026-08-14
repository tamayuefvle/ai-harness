import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { discoveryProgress, validateDiscoverySet, validateProductDocument } from "./product-lib.mjs";
import { planningDocTemplate, writePlanningDocs } from "./planning-doc-fixtures.mjs";
import { runProductCheck } from "./product-check.mjs";
import { runProjectDiscover } from "./project-discover.mjs";
import { runProjectGate } from "./project-gate.mjs";

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fixtureProject(state = "MIGRATION_PENDING", tier = "full") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "product-"));
  fs.mkdirSync(path.join(root, "harness/lifecycle"), { recursive: true });
  fs.mkdirSync(path.join(root, "harness/contracts"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/product/decisions"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/product"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "harness/project.json"),
    `${JSON.stringify({
      schemaVersion: "1.0.0",
      projectId: "demo-app",
      lifecycleMode: "full",
      state,
      discoveryTier: tier,
      pendingApproval: null,
      decisionRefs: [],
      activeProfiles: [],
      profileResolutionPath: null,
      migration: state === "MIGRATION_PENDING" ? { fromVersion: "11.0.0", proposedProfiles: [] } : null,
      history: [],
    }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(root, "harness/lifecycle/manifest.json"),
    fs.readFileSync(path.join(harnessRoot, "harness/lifecycle/manifest.json"), "utf8"),
  );
  fs.writeFileSync(
    path.join(root, "harness/contracts/product-discovery.json"),
    fs.readFileSync(path.join(harnessRoot, "harness/contracts/product-discovery.json"), "utf8"),
  );
  fs.writeFileSync(
    path.join(root, "harness/contracts/product-signal-feedback.json"),
    fs.readFileSync(path.join(harnessRoot, "harness/contracts/product-signal-feedback.json"), "utf8"),
  );
  writePlanningDocs(root, [
    "docs/product/problem.md",
    "docs/product/users.md",
    "docs/product/outcomes.md",
    "docs/product/requirements.md",
    "docs/product/idea-backlog.md",
  ]);
  return root;
}

const validProblem = `# Problem statement

## Context
Freelancers lose track of client requests across email and chat.

## Problem
There is no single queue for actionable client work.

## Why now
Remote work increased fragmented communication.
`;

const validProblemLite = `# Problem statement

## Context
Freelancers lose track of client requests across email and chat.

## Problem
There is no single queue for actionable client work.
`;

const validUsers = `# Users

## Primary users

| Segment | Goals | Constraints |
|---|---|---|
| Solo freelancer | Capture requests quickly | Limited time |

## Stakeholders

- Client sponsor: wants visibility without micromanagement
`;

const validUsersLite = `# Users

## Primary users

| Segment | Goals | Constraints |
|---|---|---|
| Solo freelancer | Capture requests quickly | Limited time |
`;

const validOutcomes = `# Outcomes

## Success metrics

| ID | Metric | Target | Measurement |
|---|---|---|---|
| OUT-001 | Time to triage | under 5 minutes | weekly sample |

## Non-goals

- Enterprise procurement workflows
`;

const validOutcomesLite = `# Outcomes

## Success metrics

| ID | Metric | Target | Measurement |
|---|---|---|---|
| OUT-001 | Time to triage | under 5 minutes | weekly sample |
`;

const validRequirements = `# Requirements

## Must

- Capture a request with source channel and due date (OUT-001)

## Should

- Export weekly summary (OUT-001)

## Could

- Calendar sync

## Won't (this cycle)

- Billing integration (PD-001)
`;

const validRequirementsLite = `# Requirements

## Must

- Capture a request with source channel and due date (OUT-001)
`;

function writeFullDiscovery(root) {
  fs.writeFileSync(path.join(root, "docs/product/problem.md"), validProblem);
  fs.writeFileSync(path.join(root, "docs/product/users.md"), validUsers);
  fs.writeFileSync(path.join(root, "docs/product/outcomes.md"), validOutcomes);
  fs.writeFileSync(path.join(root, "docs/product/requirements.md"), validRequirements);
  fs.writeFileSync(
    path.join(root, "docs/product/decisions/PD-001-billing-defer.md"),
    "# PD-001 Billing defer\n\nBilling stays out of scope for the first release.\n",
  );
}

function writeLiteDiscovery(root) {
  fs.writeFileSync(path.join(root, "docs/product/problem.md"), validProblemLite);
  fs.writeFileSync(path.join(root, "docs/product/users.md"), validUsersLite);
  fs.writeFileSync(path.join(root, "docs/product/outcomes.md"), validOutcomesLite);
  fs.writeFileSync(path.join(root, "docs/product/requirements.md"), validRequirementsLite);
}

test("validateProductDocument rejects template placeholders", () => {
  const content = planningDocTemplate("docs/product/problem.md");
  const contract = JSON.parse(fs.readFileSync(path.join(harnessRoot, "harness/contracts/product-discovery.json"), "utf8"));
  const result = validateProductDocument("docs/product/problem.md", content, contract.tiers.full);
  assert.ok(result.errors.length > 0);
});

test("validateDiscoverySet accepts full tier with traceability", () => {
  const root = fixtureProject("DISCOVERY", "full");
  writeFullDiscovery(root);
  const result = validateDiscoverySet(root);
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("validateDiscoverySet accepts lite tier with reduced sections", () => {
  const root = fixtureProject("DISCOVERY", "lite");
  writeLiteDiscovery(root);
  const result = validateDiscoverySet(root);
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("validateDiscoverySet rejects Must without OUT reference", () => {
  const root = fixtureProject("DISCOVERY", "lite");
  writeLiteDiscovery(root);
  fs.writeFileSync(path.join(root, "docs/product/requirements.md"), `# Requirements\n\n## Must\n\n- Missing outcome link\n`);
  const result = validateDiscoverySet(root);
  assert.ok(result.errors.some((error) => error.includes("OUT-xxx")));
});

test("validateDiscoverySet requires promoted idea trace", () => {
  const root = fixtureProject("DISCOVERY", "lite");
  writeLiteDiscovery(root);
  fs.writeFileSync(
    path.join(root, "docs/product/idea-backlog.md"),
    `# Idea backlog\n\n| ID | Idea | Status | Notes |\n|---|---|---|---|\n| IDEA-001 | Client inbox | promoted | From interviews |\n`,
  );
  const result = validateDiscoverySet(root);
  assert.ok(result.errors.some((error) => error.includes("IDEA-001")));
});

test("runProductCheck skips MIGRATION_PENDING by default", () => {
  const root = fixtureProject("MIGRATION_PENDING");
  const outcome = runProductCheck(root, { ifApplicable: true });
  assert.equal(outcome.status, "skipped");
});

test("runProjectDiscover sets discovery tier", () => {
  const root = fixtureProject("MIGRATION_PENDING");
  const result = runProjectDiscover(root, { id: "demo-app", tier: "lite" });
  assert.equal(result.discoveryTier, "lite");
});

test("project:gate accepts full discovery when semantic contract passes", () => {
  const root = fixtureProject("DISCOVERY", "full");
  writeFullDiscovery(root);
  const gate = runProjectGate(root, { to: "PRODUCT_APPROVED", actor: "human:qa", reason: "test" });
  assert.equal(gate.to, "PRODUCT_APPROVED");
});

test("validateDiscoverySet rejects fabrication claims without citation", () => {
  const root = fixtureProject("DISCOVERY", "lite");
  writeLiteDiscovery(root);
  fs.writeFileSync(
    path.join(root, "docs/product/problem.md"),
    `${validProblemLite}\nAdditional note: User research shows strong demand.\n`,
  );
  const result = validateDiscoverySet(root);
  assert.ok(result.errors.some((error) => error.includes("research-like claim")));
});

test("validateDiscoverySet rejects unvalidated assumption on Must item", () => {
  const root = fixtureProject("DISCOVERY", "full");
  writeFullDiscovery(root);
  fs.writeFileSync(
    path.join(root, "docs/product/requirements.md"),
    `${validRequirements}\n- Fast onboarding required (OUT-001, ASM-001)\n`,
  );
  fs.writeFileSync(
    path.join(root, "docs/product/assumptions.md"),
    `# Assumptions\n\n| ID | Assumption | Status | Evidence | Supports |\n|---|---|---|---|---|\n| ASM-001 | Users want fast onboarding | unvalidated | pending | OUT-001 |\n`,
  );
  const result = validateDiscoverySet(root);
  assert.ok(result.errors.some((error) => error.includes("ASM-001")));
});

test("validateDiscoverySet validates signal feedback links", () => {
  const root = fixtureProject("DISCOVERY", "lite");
  writeLiteDiscovery(root);
  fs.mkdirSync(path.join(root, "docs/operations/signals"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs/operations/signals/SIG-2026-08-12-demo.json"),
    `${JSON.stringify({ schemaVersion: "1.0.0", signalId: "SIG-2026-08-12-demo", type: "user-feedback", source: "support", observedAt: "2026-08-12T00:00:00.000Z", summary: "Users ask for export", severity: "medium", evidence: [], containsSecrets: false }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(root, "docs/product/signal-feedback.md"),
    `# Signal feedback\n\n| Signal | Affects | Action | Summary |\n|---|---|---|---|\n| SIG-2026-08-12-demo | OUT-001 | review | Export requests increased |\n`,
  );
  const result = validateDiscoverySet(root);
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("discoveryProgress exposes discovery tier", () => {
  const root = fixtureProject("MIGRATION_PENDING", "lite");
  const report = discoveryProgress(root);
  assert.match(report.nextAction, /project:discover/);
});
