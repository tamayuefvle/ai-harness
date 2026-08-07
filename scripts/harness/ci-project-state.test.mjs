import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(repoRoot, "scripts/harness/ci-project-state.sh");

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function makeRepo(files = {}, { includeHarness = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-ci-state-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "ci-state@example.invalid");
  git(root, "config", "user.name", "CI State Test");
  const initialFiles = includeHarness
    ? {
        "README_HARNESS.md": "# Harness\n",
        "package.scripts.fragment.json": '{"scripts":{}}\n',
        "package.devDependencies.fragment.json": '{"devDependencies":{}}\n',
        ...files,
      }
    : files;
  for (const [name, content] of Object.entries(initialFiles)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  git(root, "add", ".");
  git(root, "commit", "-q", "--allow-empty", "-m", "root");
  return root;
}

function commit(root, message = "next") {
  git(root, "add", "-A");
  git(root, "commit", "-q", "--allow-empty", "-m", message);
}

function run(root, env = {}) {
  const outputFile = path.join(root, ".github-output");
  const result = spawnSync("bash", [script, "--root", root], {
    encoding: "utf8",
    env: { ...process.env, ...env, GITHUB_OUTPUT: outputFile },
  });
  const values = Object.fromEntries(
    fs.readFileSync(outputFile, "utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  return { ...result, values };
}

const packageJson = '{"name":"fixture","private":true}\n';
const packageLock = '{"name":"fixture","lockfileVersion":3,"packages":{}}\n';

test("allows only a root-commit harness-only bootstrap", () => {
  const root = makeRepo();
  const first = run(root);
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(first.values, {
    state: "bootstrap",
    reason: "root-harness-only",
    lockfile: "",
    root_commit: "true",
  });

  fs.writeFileSync(path.join(root, "README.md"), "second commit\n");
  commit(root);
  const second = run(root);
  assert.equal(second.status, 1);
  assert.equal(second.values.state, "invalid");
  assert.equal(second.values.reason, "post-bootstrap-project-metadata-missing");
  assert.equal(second.values.root_commit, "false");
});

test("rejects a generic package-less root commit without the harness contract", () => {
  const root = makeRepo({}, { includeHarness: false });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.equal(result.values.reason, "root-bootstrap-contract-missing");
});

test("accepts package.json with exactly one npm lockfile", () => {
  const packageLockRepo = makeRepo({ "package.json": packageJson, "package-lock.json": packageLock });
  const packageLockResult = run(packageLockRepo);
  assert.equal(packageLockResult.status, 0, packageLockResult.stderr);
  assert.equal(packageLockResult.values.state, "ready");
  assert.equal(packageLockResult.values.lockfile, "package-lock.json");

  const shrinkwrapRepo = makeRepo({ "package.json": packageJson, "npm-shrinkwrap.json": packageLock });
  const shrinkwrapResult = run(shrinkwrapRepo);
  assert.equal(shrinkwrapResult.status, 0, shrinkwrapResult.stderr);
  assert.equal(shrinkwrapResult.values.state, "ready");
  assert.equal(shrinkwrapResult.values.lockfile, "npm-shrinkwrap.json");
});

test("rejects incomplete and non-npm project metadata", () => {
  const cases = [
    [{ "package.json": packageJson }, "npm-lockfile-missing"],
    [{ "package-lock.json": packageLock }, "package-manifest-missing"],
    [{ "package.json": packageJson, "yarn.lock": "" }, "unsupported-or-ambiguous-package-manager"],
    [{ "package.json": packageJson, "pnpm-lock.yaml": "lockfileVersion: 9\n" }, "unsupported-or-ambiguous-package-manager"],
    [{ "package.json": packageJson, "package-lock.json": packageLock, "npm-shrinkwrap.json": packageLock }, "multiple-npm-lockfiles"],
  ];

  for (const [files, reason] of cases) {
    const result = run(makeRepo(files));
    assert.equal(result.status, 1, `${reason}: ${result.stderr}`);
    assert.equal(result.values.state, "invalid");
    assert.equal(result.values.reason, reason);
  }
});

test("rejects deletion of a previously ready project on a later commit", () => {
  const root = makeRepo({ "package.json": packageJson, "package-lock.json": packageLock });
  fs.rmSync(path.join(root, "package.json"));
  fs.rmSync(path.join(root, "package-lock.json"));
  commit(root, "delete project metadata");

  const result = run(root);
  assert.equal(result.status, 1);
  assert.equal(result.values.reason, "post-bootstrap-project-metadata-missing");
  assert.equal(result.values.root_commit, "false");
});

test("rejects shallow history instead of misclassifying a later commit as root", () => {
  const source = makeRepo();
  fs.writeFileSync(path.join(source, "README.md"), "second commit\n");
  commit(source);

  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "harness-ci-shallow-parent-"));
  const clone = path.join(parent, "clone");
  const cloned = spawnSync("git", ["clone", "-q", "--depth", "1", `file://${source}`, clone], { encoding: "utf8" });
  assert.equal(cloned.status, 0, cloned.stderr);

  const result = run(clone);
  assert.equal(result.status, 1);
  assert.equal(result.values.reason, "shallow-history");
});

test("rejects symbolic-link project metadata", { skip: process.platform === "win32" }, () => {
  const root = makeRepo({ "manifest.json": packageJson, "package-lock.json": packageLock });
  fs.symlinkSync("manifest.json", path.join(root, "package.json"));
  commit(root, "add symlinked manifest");

  const result = run(root);
  assert.equal(result.status, 1);
  assert.equal(result.values.reason, "symlinked-project-metadata");
});
