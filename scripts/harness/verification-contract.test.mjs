import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scripts = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.scripts.fragment.json"), "utf8")).scripts;
const workflow = fs.readFileSync(path.join(repoRoot, ".github/workflows/quality.yml"), "utf8");
const e2eWorkflow = fs.readFileSync(path.join(repoRoot, ".github/workflows/e2e.yml"), "utf8");
const reactDoctorWorkflow = fs.readFileSync(path.join(repoRoot, ".github/workflows/react-doctor.yml"), "utf8");
const reviewScript = fs.readFileSync(path.join(repoRoot, "scripts/harness/codex-review.sh"), "utf8");

test("verify:ci composes canonical verification groups", () => {
  assert.equal(scripts["verify:harness"], "npm run harness:check && npm run capabilities:check && npm run execution:check && npm run schemas:check && npm run security:check && npm run test:harness");
  assert.equal(scripts["verify:static"], "npm run lint && npm run typecheck");
  assert.equal(scripts["verify:application"], "npm run test:unit && npm run build");
  assert.equal(scripts["verify:react"], "node scripts/harness/react-doctor-ci.mjs");
  assert.equal(scripts["verify:e2e"], "npm run profile:check -- --only e2e");
  assert.equal(scripts["verify:ci"], "npm run verify:harness && npm run profile:check -- --exclude e2e");
  assert.equal(scripts["verify:all"], "npm run verify:ci && npm run verify:e2e");
});

test("GitHub Actions calls canonical verification scripts instead of enumerating harness tests", () => {
  assert.match(workflow, /npm run verify:ci/);
  assert.doesNotMatch(workflow, /npm run test:harness:/);
  assert.doesNotMatch(workflow, /node --test/);
  assert.doesNotMatch(workflow, /npm run harness:check/);
  assert.doesNotMatch(workflow, /npm run capabilities:check/);
  assert.match(workflow, /scripts\/harness\/ci-project-state\.sh/);
  assert.match(workflow, /cache-dependency-path: \${{ steps\.project-state\.outputs\.lockfile }}/);
});


test("PR E2E runs only in the dedicated workflow", () => {
  assert.doesNotMatch(workflow, /playwright|verify:e2e|test:e2e/i);
  assert.match(e2eWorkflow, /npm run verify:e2e/);
  assert.match(e2eWorkflow, /scripts\/harness\/ci-project-state\.sh/);
  assert.match(e2eWorkflow, /fetch-depth: 0/);
});


test("all Node-dependent workflows use the bootstrap preflight", () => {
  for (const source of [workflow, e2eWorkflow, reactDoctorWorkflow]) {
    assert.match(source, /scripts\/harness\/ci-project-state\.sh/);
    assert.match(source, /steps\.project-state\.outputs\.state == 'ready'/);
    assert.match(source, /fetch-depth: 0/);
  }
  assert.match(reactDoctorWorkflow, /scope: \${{ steps\.react-doctor-scope\.outputs\.scope }}/);
  assert.match(reactDoctorWorkflow, /scope=full/);
  assert.match(reactDoctorWorkflow, /scope=changed/);
  assert.match(reactDoctorWorkflow, /quality\/react-doctor/);
  assert.match(reactDoctorWorkflow, /steps\.react-profile\.outputs\.enabled/);
});


test("independent review preserves verification evidence and finalizes diagnostic digests", () => {
  assert.match(reviewScript, /github-context-review\.json/);
  assert.doesNotMatch(reviewScript, /--output "\$REPORT_DIR\/github-context\.json"/);
  assert.match(reviewScript, /VERIFICATION_REPORT=.*verification\.json/);
  assert.match(reviewScript, /finalize-review-report\.mjs "\$REPORT_PATH" "\$ACTIVE_SPEC" "\$VERIFIED_HEAD"/);
});
