import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { installGitHooks } from "./install-git-hooks.mjs";

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-hooks-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  fs.mkdirSync(path.join(root, ".githooks"));
  for (const name of ["pre-commit", "pre-push"]) {
    const target = path.join(root, ".githooks", name);
    fs.writeFileSync(target, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o644 });
    fs.chmodSync(target, 0o644);
  }
  return root;
}

test("installs hook path and restores POSIX execute permissions after ZIP-style extraction", () => {
  const root = makeRepo();
  try {
    const result = installGitHooks({ repoRoot: root, platform: "linux", stdio: "ignore" });
    assert.equal(result.hooksPath, ".githooks");
    for (const name of ["pre-commit", "pre-push"]) {
      const mode = fs.statSync(path.join(root, ".githooks", name)).mode & 0o777;
      assert.ok((mode & 0o111) !== 0, `${name} should be executable`);
    }
    execFileSync("git", ["hook", "run", "pre-commit"], { cwd: root, stdio: "ignore" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("fails when a required hook is missing", () => {
  const root = makeRepo();
  try {
    fs.rmSync(path.join(root, ".githooks", "pre-push"));
    assert.throws(() => installGitHooks({ repoRoot: root, platform: "linux", stdio: "ignore" }), /pre-push/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
