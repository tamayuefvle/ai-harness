import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export const DISTRIBUTION_PACKAGE_NAME = "ai-harness";

export function isHarnessSubstrate(pkg) {
  return pkg?.name === DISTRIBUTION_PACKAGE_NAME;
}

export function fragmentMergeViolations(pkg, scripts, devDependencies) {
  const violations = [];
  for (const [key, value] of Object.entries(scripts)) {
    if (pkg?.scripts?.[key] !== value) violations.push(`scripts.${key}`);
  }
  for (const [key, value] of Object.entries(devDependencies)) {
    if (pkg?.devDependencies?.[key] !== value) violations.push(`devDependencies.${key}`);
  }
  return violations;
}

export function assertPackageContract(pkg, { manifest, scripts, devDependencies, repoRoot } = {}) {
  const violations = fragmentMergeViolations(pkg, scripts, devDependencies);
  assert.deepEqual(violations, [], `package.json fragment merge violations: ${violations.join(", ")}`);

  if (isHarnessSubstrate(pkg)) {
    assert.equal(pkg.name, DISTRIBUTION_PACKAGE_NAME);
    assert.equal(pkg.private, true);
    assert.equal(pkg.version, manifest.version);
    assert.deepEqual(pkg.scripts, scripts);
    assert.deepEqual(pkg.devDependencies, devDependencies);
  }

  if (repoRoot) {
    assert.equal(fs.existsSync(path.join(repoRoot, "package-lock.json")), true, "package-lock.json must exist");
    if (isHarnessSubstrate(pkg)) {
      assert.equal(fs.existsSync(path.join(repoRoot, "npm-shrinkwrap.json")), false, "npm-shrinkwrap.json must not exist for the harness substrate");
    }
  }
}
