import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertPackageContract,
  fragmentMergeViolations,
} from "./package-substrate.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "PACKAGE_MANIFEST.json"), "utf8"));
const scripts = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.scripts.fragment.json"), "utf8")).scripts;
const devDependencies = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.devDependencies.fragment.json"), "utf8")).devDependencies;

function overlayPackage() {
  return {
    name: "demo-app",
    version: "0.1.0",
    scripts: { ...scripts, dev: "example-dev", build: "example-build" },
    devDependencies: { ...devDependencies, example: "1.0.0" },
    dependencies: { runtime: "1.0.0" },
  };
}

test("shipped package.json is the harness substrate synchronized from fragments", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assertPackageContract(pkg, { manifest, scripts, devDependencies, repoRoot });
});

test("product overlay may add package metadata while preserving fragments", () => {
  assertPackageContract(overlayPackage(), { manifest, scripts, devDependencies });
});

test("product overlay fails when a fragment script is missing", () => {
  const pkg = overlayPackage();
  const key = Object.keys(scripts)[0];
  delete pkg.scripts[key];
  assert.deepEqual(fragmentMergeViolations(pkg, scripts, devDependencies), [`scripts.${key}`]);
  assert.throws(() => assertPackageContract(pkg, { manifest, scripts, devDependencies }), /fragment merge violations/);
});

test("product overlay fails when a fragment script is changed", () => {
  const pkg = overlayPackage();
  const key = Object.keys(scripts)[0];
  pkg.scripts[key] = "changed-command";
  assert.deepEqual(fragmentMergeViolations(pkg, scripts, devDependencies), [`scripts.${key}`]);
  assert.throws(() => assertPackageContract(pkg, { manifest, scripts, devDependencies }), /fragment merge violations/);
});

test("product overlay fails when a fragment devDependency is missing", () => {
  const pkg = overlayPackage();
  const key = Object.keys(devDependencies)[0];
  delete pkg.devDependencies[key];
  assert.deepEqual(fragmentMergeViolations(pkg, scripts, devDependencies), [`devDependencies.${key}`]);
  assert.throws(() => assertPackageContract(pkg, { manifest, scripts, devDependencies }), /fragment merge violations/);
});

test("product overlay fails when a fragment devDependency version is changed", () => {
  const pkg = overlayPackage();
  const key = Object.keys(devDependencies)[0];
  pkg.devDependencies[key] = "changed-version";
  assert.deepEqual(fragmentMergeViolations(pkg, scripts, devDependencies), [`devDependencies.${key}`]);
  assert.throws(() => assertPackageContract(pkg, { manifest, scripts, devDependencies }), /fragment merge violations/);
});

test("package named ai-harness fails closed when it has an extra script", () => {
  const pkg = { ...overlayPackage(), name: "ai-harness", private: true, version: manifest.version };
  assert.throws(() => assertPackageContract(pkg, { manifest, scripts, devDependencies }), /Expected values to be strictly deep-equal/);
});
