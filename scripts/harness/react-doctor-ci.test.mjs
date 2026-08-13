import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { selectCiMode, reactDoctorProfileEnabled } from "./react-doctor-ci.mjs";

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "react-doctor-ci-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "react-doctor-ci@example.invalid");
  git(root, "config", "user.name", "React Doctor CI Test");
  git(root, "commit", "-q", "--allow-empty", "-m", "root");
  return root;
}

test("selects full scan for the root commit", () => {
  const root = makeRepo();
  assert.deepEqual(selectCiMode(root), { mode: "full", reason: "root-commit" });
});

test("selects changed scan when a parent commit exists", () => {
  const root = makeRepo();
  fs.writeFileSync(path.join(root, "README.md"), "next\n");
  git(root, "add", "README.md");
  git(root, "commit", "-q", "-m", "next");
  assert.deepEqual(selectCiMode(root), {
    mode: "changed",
    reason: "comparison-commit-available",
  });
});

test("does not infer a root full scan from shallow history", () => {
  const source = makeRepo();
  fs.writeFileSync(path.join(source, "README.md"), "next\n");
  git(source, "add", "README.md");
  git(source, "commit", "-q", "-m", "next");

  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "react-doctor-ci-shallow-parent-"));
  const clone = path.join(parent, "clone");
  const result = spawnSync("git", ["clone", "-q", "--depth", "1", `file://${source}`, clone], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(selectCiMode(clone), { mode: "changed", reason: "shallow-history" });
});

test("preserves changed-mode no-worktree handling for the canonical wrapper", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "react-doctor-ci-nongit-"));
  assert.deepEqual(selectCiMode(root), { mode: "changed", reason: "not-a-git-worktree" });
});

test("does not enable React Doctor until the quality profile is selected", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "react-doctor-profile-"));
  fs.mkdirSync(path.join(root, "harness"), { recursive: true });
  fs.writeFileSync(path.join(root, "harness/project.json"), JSON.stringify({
    activeProfiles: [],
    migration: { proposedProfiles: [] },
  }));
  assert.equal(reactDoctorProfileEnabled(root), false);
  fs.writeFileSync(path.join(root, "harness/project.json"), JSON.stringify({
    activeProfiles: [],
    migration: { proposedProfiles: ["quality/react-doctor"] },
  }));
  assert.equal(reactDoctorProfileEnabled(root), true);
});
