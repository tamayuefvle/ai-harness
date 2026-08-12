import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { designProgress, setDesignTier, validateArchitectureDocuments, validateStackDocuments } from "./design-lib.mjs";
import { runArchitectureCheck } from "./architecture-check.mjs";
import { runStackCheck } from "./stack-check.mjs";
import { runProjectGate } from "./project-gate.mjs";

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fixtureProject(state = "PRODUCT_APPROVED", { designTier = "full", discoveryTier = "full" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "design-"));
  fs.mkdirSync(path.join(root, "harness/lifecycle"), { recursive: true });
  fs.mkdirSync(path.join(root, "harness/contracts"), { recursive: true });
  fs.mkdirSync(path.join(root, "harness/profiles"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/product"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/architecture"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "harness/project.json"),
    `${JSON.stringify({
      schemaVersion: "1.0.0",
      projectId: "demo-app",
      lifecycleMode: "full",
      state,
      discoveryTier,
      designTier,
      pendingApproval: null,
      decisionRefs: [],
      activeProfiles: [],
      profileResolutionPath: null,
      migration: null,
      history: [],
    }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(root, "harness/lifecycle/manifest.json"),
    fs.readFileSync(path.join(harnessRoot, "harness/lifecycle/manifest.json"), "utf8"),
  );
  fs.writeFileSync(
    path.join(root, "harness/contracts/design-phase.json"),
    fs.readFileSync(path.join(harnessRoot, "harness/contracts/design-phase.json"), "utf8"),
  );
  fs.writeFileSync(
    path.join(root, "harness/profiles/registry.json"),
    fs.readFileSync(path.join(harnessRoot, "harness/profiles/registry.json"), "utf8"),
  );
  for (const file of ["technology-options.md", "technology-decision.md"]) {
    fs.copyFileSync(path.join(harnessRoot, "docs/product", file), path.join(root, "docs/product", file));
  }
  for (const file of ["baseline.md", "security-baseline.md", "quality-strategy.md"]) {
    fs.copyFileSync(path.join(harnessRoot, "docs/architecture", file), path.join(root, "docs/architecture", file));
  }
  fs.writeFileSync(
    path.join(root, "docs/product/outcomes.md"),
    `# Outcomes\n\n## Success metrics\n\n| ID | Metric | Target | Measurement |\n|---|---|---|---|\n| OUT-001 | Time to triage | under 5 minutes | weekly sample |\n`,
  );
  return root;
}

const validOptions = `# Technology options

## Candidates

| Option | Pros | Cons | Fit |
|---|---|---|---|
| Node + React web app | Fast delivery | Browser constraints | High |

## Evaluation criteria

- Team familiarity
- Time to first release

## Recommendation

Prefer Node + React for the first release, with Next.js optional later.
`;

const validDecision = `# Technology decision

## Decision

Adopt a Node runtime with React UI for the MVP.

## Selected profiles

- \`runtime/node\`
- \`framework/react\`
- \`language/typescript\`
- \`package-manager/npm\`

## Rationale

Matches approved latency and delivery constraints without introducing a new backend language.

## Rejected options

| Option | Reason rejected |
|---|---|
| Python API-only | UI delivery would still require a separate frontend stack |
`;

const validBaseline = `# Architecture baseline

## System context

Solo freelancers and their clients interact through a web app that queues requests.

## Boundaries

Owns request inbox and triage UI. Defers billing and email transport to external providers.

## Quality attributes

Prioritize triage latency under five minutes (OUT-001) and predictable operability over customizable workflows.

## Rollback

Revert the last GitHub production promotion and redeploy the previous release artifact.
`;

test("validateStackDocuments rejects template placeholders", () => {
  const root = fixtureProject("PRODUCT_APPROVED");
  const result = validateStackDocuments(root);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("validateStackDocuments accepts filled stack docs with registry profiles", () => {
  const root = fixtureProject("PRODUCT_APPROVED");
  fs.writeFileSync(path.join(root, "docs/product/technology-options.md"), validOptions);
  fs.writeFileSync(path.join(root, "docs/product/technology-decision.md"), validDecision);
  const result = validateStackDocuments(root);
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("validateStackDocuments accepts a single selected profile", () => {
  const root = fixtureProject("PRODUCT_APPROVED", { designTier: "lite" });
  fs.writeFileSync(path.join(root, "docs/product/technology-options.md"), validOptions);
  fs.writeFileSync(
    path.join(root, "docs/product/technology-decision.md"),
    `# Technology decision

## Decision

Adopt Node runtime for the CLI-first MVP.

## Selected profiles

- \`runtime/node\`

## Rationale

Keeps the first release small while matching approved latency goals.
`,
  );
  const result = validateStackDocuments(root);
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("validateStackDocuments rejects unknown profile ids", () => {
  const root = fixtureProject("PRODUCT_APPROVED");
  fs.writeFileSync(path.join(root, "docs/product/technology-options.md"), validOptions);
  fs.writeFileSync(
    path.join(root, "docs/product/technology-decision.md"),
    validDecision.replace("runtime/node", "runtime/does-not-exist"),
  );
  const result = validateStackDocuments(root);
  assert.ok(result.errors.some((error) => error.includes("runtime/does-not-exist")));
});

test("validateArchitectureDocuments accepts filled baseline", () => {
  const root = fixtureProject("STACK_APPROVED");
  fs.writeFileSync(path.join(root, "docs/architecture/baseline.md"), validBaseline);
  const result = validateArchitectureDocuments(root);
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("runStackCheck skips DISCOVERY by default", () => {
  const root = fixtureProject("DISCOVERY");
  const outcome = runStackCheck(root, { ifApplicable: true });
  assert.equal(outcome.status, "skipped");
});

test("runArchitectureCheck skips PRODUCT_APPROVED by default", () => {
  const root = fixtureProject("PRODUCT_APPROVED");
  const outcome = runArchitectureCheck(root, { ifApplicable: true });
  assert.equal(outcome.status, "skipped");
});

test("project:gate to STACK_APPROVED requires stack:check", () => {
  const root = fixtureProject("PRODUCT_APPROVED");
  assert.throws(
    () => runProjectGate(root, { to: "STACK_APPROVED", actor: "human:qa", reason: "test" }),
    /Stack design contract violations|template|incomplete|Candidates/i,
  );
  fs.writeFileSync(path.join(root, "docs/product/technology-options.md"), validOptions);
  fs.writeFileSync(path.join(root, "docs/product/technology-decision.md"), validDecision);
  const gate = runProjectGate(root, { to: "STACK_APPROVED", actor: "human:qa", reason: "stack ready" });
  assert.equal(gate.to, "STACK_APPROVED");
  const project = JSON.parse(fs.readFileSync(path.join(root, "harness/project.json"), "utf8"));
  assert.ok(project.proposedProfiles.includes("runtime/node"));
});

test("stack check rejects selected profiles missing from proposedProfiles", () => {
  const root = fixtureProject("PRODUCT_APPROVED");
  fs.writeFileSync(path.join(root, "docs/product/technology-options.md"), validOptions);
  fs.writeFileSync(path.join(root, "docs/product/technology-decision.md"), validDecision);
  const projectPath = path.join(root, "harness/project.json");
  const project = JSON.parse(fs.readFileSync(projectPath, "utf8"));
  project.proposedProfiles = ["runtime/node"];
  fs.writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
  const result = validateStackDocuments(root);
  assert.ok(result.errors.some((error) => error.includes("framework/react")));
});

test("project:gate to ARCHITECTURE_APPROVED requires architecture:check", () => {
  const root = fixtureProject("STACK_APPROVED");
  assert.throws(
    () => runProjectGate(root, { to: "ARCHITECTURE_APPROVED", actor: "human:qa", reason: "test" }),
    /Architecture design contract violations|incomplete|template/i,
  );
  fs.writeFileSync(path.join(root, "docs/architecture/baseline.md"), validBaseline);
  const gate = runProjectGate(root, { to: "ARCHITECTURE_APPROVED", actor: "human:qa", reason: "arch ready" });
  assert.equal(gate.to, "ARCHITECTURE_APPROVED");
});

test("designProgress guides PRODUCT_APPROVED next action", () => {
  const root = fixtureProject("PRODUCT_APPROVED");
  const report = designProgress(root);
  assert.equal(report.phase, "stack");
  assert.equal(report.designTier, "full");
  assert.match(report.nextAction, /technology-options|technology-decision|stack:check/);
});

test("setDesignTier records lite design path", () => {
  const root = fixtureProject("PRODUCT_APPROVED", { discoveryTier: "full" });
  const result = setDesignTier(root, "lite");
  assert.equal(result.designTier, "lite");
  assert.equal(designProgress(root).designTier, "lite");
});

test("full stack check requires a rejected options row", () => {
  const root = fixtureProject("PRODUCT_APPROVED", { designTier: "full" });
  fs.writeFileSync(path.join(root, "docs/product/technology-options.md"), validOptions);
  fs.writeFileSync(
    path.join(root, "docs/product/technology-decision.md"),
    `# Technology decision

## Decision

Adopt Node runtime.

## Selected profiles

- \`runtime/node\`

## Rationale

Smallest viable runtime for the approved latency goal.
`,
  );
  const result = validateStackDocuments(root);
  assert.ok(result.errors.some((error) => error.includes("Rejected options")));
});

test("lite architecture check does not require security/quality docs", () => {
  const root = fixtureProject("STACK_APPROVED", { designTier: "lite" });
  fs.rmSync(path.join(root, "docs/architecture/security-baseline.md"));
  fs.rmSync(path.join(root, "docs/architecture/quality-strategy.md"));
  fs.writeFileSync(path.join(root, "docs/architecture/baseline.md"), validBaseline);
  const result = validateArchitectureDocuments(root);
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("full architecture check requires every OUT-xxx reference", () => {
  const root = fixtureProject("STACK_APPROVED", { designTier: "full" });
  fs.writeFileSync(
    path.join(root, "docs/architecture/baseline.md"),
    validBaseline.replace(" (OUT-001)", ""),
  );
  const result = validateArchitectureDocuments(root);
  assert.ok(result.errors.some((error) => error.includes("OUT-001")));
});

