import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { migrateProject } from "./migrate-v15.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(here, "../..");

function rootWithProject(state = "DISCOVERY", history = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-v15-migrate-"));
  fs.mkdirSync(path.join(root, "harness/lifecycle"), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, "harness/lifecycle/manifest.json"), path.join(root, "harness/lifecycle/manifest.json"));
  fs.writeFileSync(path.join(root, "harness/project.json"), JSON.stringify({
    schemaVersion: "1.0.0",
    projectId: "demo-project",
    lifecycleMode: "full",
    state,
    discoveryTier: "full",
    designTier: "full",
    pendingApproval: null,
    decisionRefs: ["docs/product/technology-decision.md"],
    activeProfiles: [],
    proposedProfiles: [],
    profileResolutionPath: null,
    migration: null,
    history,
  }, null, 2));
  return root;
}

test("v15 migration maps DISCOVERY to PLANNING, moves technology docs, and creates backup", () => {
  const root = rootWithProject();
  fs.mkdirSync(path.join(root, "docs/product"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs/product/technology-options.md"), "options\n");
  fs.writeFileSync(path.join(root, "docs/product/technology-decision.md"), "decision\n");

  const result = migrateProject(root);
  const project = JSON.parse(fs.readFileSync(path.join(root, "harness/project.json"), "utf8"));

  assert.equal(result.changed, true);
  assert.equal(project.schemaVersion, "2.0.0");
  assert.equal(project.state, "PLANNING");
  assert.ok(fs.existsSync(path.join(root, "harness/project.v14.backup.json")));
  assert.ok(fs.existsSync(path.join(root, "docs/architecture/technology-options.md")));
  assert.ok(fs.existsSync(path.join(root, "docs/architecture/technology-decision.md")));
  assert.equal(fs.existsSync(path.join(root, "docs/product/technology-options.md")), false);
  assert.deepEqual(project.decisionRefs, ["docs/architecture/technology-decision.md"]);
});

test("v15 migration preserves ACTIVE without fabricating missing phase approvals", () => {
  const root = rootWithProject("ACTIVE", []);
  const result = migrateProject(root);
  const project = JSON.parse(fs.readFileSync(path.join(root, "harness/project.json"), "utf8"));

  assert.equal(result.state, "ACTIVE");
  assert.equal(project.state, "ACTIVE");
  for (const gate of Object.values(project.phaseGates)) assert.equal(gate.status, "pending");
});

test("v15 migration fails before backup when legacy/new technology documents conflict", () => {
  const root = rootWithProject();
  fs.mkdirSync(path.join(root, "docs/product"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/architecture"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs/product/technology-options.md"), "legacy\n");
  fs.writeFileSync(path.join(root, "docs/architecture/technology-options.md"), "new\n");

  assert.throws(() => migrateProject(root), /different content/);
  assert.equal(fs.existsSync(path.join(root, "harness/project.v14.backup.json")), false);
});
