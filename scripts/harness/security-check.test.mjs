import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectSecurityFindings } from "./security-check.mjs";

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-security-"));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  fs.writeFileSync(path.join(root, "FILE_INVENTORY.txt"), Object.keys(files).concat("FILE_INVENTORY.txt").join("\n") + "\n");
  return root;
}

test("passes a clean inventory and production release gate", () => {
  const root = fixture({ ".github/workflows/release-gate.yml": "jobs:\n  gate:\n    environment: production\n    steps:\n      - run: echo ok\n", "scripts/ok.mjs": "console.log('ok');\n" });
  const result = collectSecurityFindings(root);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.findings, []);
});

test("rejects symlinked inventory entries", () => {
  const root = fixture({ ".github/workflows/release-gate.yml": "environment: production\n" });
  fs.writeFileSync(path.join(root, "target.txt"), "ok");
  fs.symlinkSync(path.join(root, "target.txt"), path.join(root, "link.txt"));
  fs.appendFileSync(path.join(root, "FILE_INVENTORY.txt"), "link.txt\n");
  const result = collectSecurityFindings(root);
  assert.ok(result.findings.some((item) => item.kind === "symlink"));
});

test("rejects high-confidence secret material", () => {
  const token = `ghp_${"A".repeat(24)}`;
  const root = fixture({ ".github/workflows/release-gate.yml": "environment: production\n", "README.txt": token });
  const result = collectSecurityFindings(root);
  assert.ok(result.findings.some((item) => item.kind === "secret"));
});

test("rejects prohibited executable operations", () => {
  const command = ["git", "reset", "--hard"].join(" ");
  const root = fixture({ ".github/workflows/release-gate.yml": "environment: production\n", "scripts/bad.sh": `#!/bin/sh\n${command}\n` });
  const result = collectSecurityFindings(root);
  assert.ok(result.findings.some((item) => item.kind === "dangerous-executable"));
});

test("rejects inventory traversal", () => {
  const root = fixture({ ".github/workflows/release-gate.yml": "environment: production\n" });
  fs.appendFileSync(path.join(root, "FILE_INVENTORY.txt"), "../escape\n");
  const result = collectSecurityFindings(root);
  assert.ok(result.findings.some((item) => item.kind === "inventory-path"));
});

