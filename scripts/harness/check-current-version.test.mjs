import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkCurrentVersion } from "./check-current-version.mjs";

function fixture({ packageJson, readmeVersion = "14.9.2" }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-current-version-"));
  fs.writeFileSync(path.join(root, "PACKAGE_MANIFEST.json"), JSON.stringify({ version: "14.9.2" }));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(packageJson));
  fs.writeFileSync(path.join(root, "README_HARNESS.md"), `# AI Development Harness v${readmeVersion}\n`);
  fs.writeFileSync(path.join(root, "SECURITY.md"), "# Security policy — AI Development Harness v14.9.2\n");
  fs.writeFileSync(path.join(root, "NEW_REPOSITORY_SETUP.md"), "# New Repository Setup — v14.9.2\n");
  fs.writeFileSync(path.join(root, "MIGRATION.md"), "# Migration to v14.9.2\n");
  return root;
}

test("overlay package version and private metadata are independent", (t) => {
  const root = fixture({ packageJson: { name: "demo-app", version: "0.1.0", private: false } });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(checkCurrentVersion(root).failures, []);
});

test("substrate package version drift fails", (t) => {
  const root = fixture({ packageJson: { name: "ai-harness", version: "14.9.1", private: true } });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(checkCurrentVersion(root).failures, ["package.json: version is not 14.9.2"]);
});

test("overlay still fails when a document heading drifts", (t) => {
  const root = fixture({ packageJson: { name: "demo-app", version: "0.1.0" }, readmeVersion: "14.9.1" });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(checkCurrentVersion(root).failures, ["README_HARNESS.md: current-version heading is not 14.9.2"]);
});
