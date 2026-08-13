import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("shipped package.json is the harness substrate synchronized from fragments", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "PACKAGE_MANIFEST.json"), "utf8"));
  const scripts = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.scripts.fragment.json"), "utf8")).scripts;
  const devDependencies = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.devDependencies.fragment.json"), "utf8")).devDependencies;
  assert.equal(pkg.name, "ai-harness");
  assert.equal(pkg.private, true);
  assert.equal(pkg.version, manifest.version);
  assert.deepEqual(pkg.scripts, scripts);
  assert.deepEqual(pkg.devDependencies, devDependencies);
  assert.ok(fs.existsSync(path.join(repoRoot, "package-lock.json")));
  assert.equal(fs.existsSync(path.join(repoRoot, "npm-shrinkwrap.json")), false);
});
