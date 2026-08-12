import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  collectCursorPreflight,
  cursorCliArgs,
  createCursorWorktree,
  parseChangedFiles,
  roleCursorConfig,
  staticCursorContract,
} from "./cursor-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function mockRunner({ dirty = false, missing = false } = {}) {
  return (command, args) => {
    const joined = args.join(" ");
    if ((command === "agent" || command === "cursor-agent") && joined === "--version") {
      if (missing) return { exitCode: 1, stdout: "", stderr: "missing" };
      return command === "agent" ? { exitCode: 0, stdout: "2026.08.0\n", stderr: "" } : { exitCode: 1, stdout: "", stderr: "" };
    }
    if (command === "agent" && joined === "--help") return { exitCode: 0, stdout: "-p, --print\n--output-format <format>\n", stderr: "" };
    if (command === "git" && joined === "rev-parse --show-toplevel") return { exitCode: 0, stdout: `${repoRoot}\n`, stderr: "" };
    if (command === "git" && joined === "status --porcelain=v1 --untracked-files=all") return { exitCode: 0, stdout: dirty ? " M src/example.ts\n" : "", stderr: "" };
    return { exitCode: 1, stdout: "", stderr: `unexpected: ${command} ${joined}` };
  };
}

function initTempGitRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-worktree-"));
  fs.mkdirSync(path.join(root, "harness/cursor"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "harness/cursor/manifest.json"), path.join(root, "harness/cursor/manifest.json"));
  fs.writeFileSync(path.join(root, "tracked.txt"), "base\n");
  const run = (args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  run(["init", "-q"]);
  run(["config", "user.email", "harness@example.invalid"]);
  run(["config", "user.name", "Harness Test"]);
  run(["add", "."]);
  run(["commit", "-qm", "fixture"]);
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  return { root, head };
}

test("Cursor static contract keeps force bounded to the isolated implementer and policy projections synchronized", () => {
  const contract = staticCursorContract(repoRoot);
  assert.deepEqual(contract, { ok: true, failures: [] });
});

test("Cursor role permissions are read-only by default and block shell/MCP/secret access for every role", () => {
  const readOnly = roleCursorConfig(repoRoot, "read-only").permissions.deny;
  const implementer = roleCursorConfig(repoRoot, "implementer").permissions.deny;
  assert.ok(readOnly.includes("Write(**/*)"));
  assert.equal(implementer.includes("Write(**/*)"), false);
  for (const deny of ["Shell(*)", "Mcp(*:*)", "Read(.env*)", "Write(.cursor/cli.json)"]) {
    assert.ok(readOnly.includes(deny), deny);
    assert.ok(implementer.includes(deny), deny);
  }
});


test("Cursor CLI force flag is emitted only for the isolated implementer", () => {
  assert.equal(cursorCliArgs(repoRoot, "read-only", "prompt").includes("--force"), false);
  assert.equal(cursorCliArgs(repoRoot, "reviewer", "prompt").includes("--force"), false);
  assert.equal(cursorCliArgs(repoRoot, "implementer", "prompt").includes("--force"), true);
});

test("Cursor preflight validates headless JSON capability and clean Git base without calling the network", () => {
  const report = collectCursorPreflight(repoRoot, { runner: mockRunner() });
  assert.equal(report.status, "pass");
  assert.equal(report.binary, "agent");
  assert.equal(report.reasonCode, null);
});

test("Cursor preflight fails closed for missing CLI and dirty base", () => {
  assert.equal(collectCursorPreflight(repoRoot, { runner: mockRunner({ missing: true }) }).reasonCode, "cursor_cli_missing");
  assert.equal(collectCursorPreflight(repoRoot, { runner: mockRunner({ dirty: true }) }).reasonCode, "dirty_base");
});

test("Cursor linked worktree lives under Git common metadata so the primary worktree stays clean", () => {
  const fixture = initTempGitRepo();
  try {
    const created = createCursorWorktree(fixture.root, "run-001", fixture.head);
    assert.match(created.reference, /^git-common-dir:harness-worktrees\/cursor\/run-001$/);
    assert.equal(fs.existsSync(path.join(created.absolute, "tracked.txt")), true);
    const status = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: fixture.root, encoding: "utf8" });
    assert.equal(status.status, 0, status.stderr);
    assert.equal(status.stdout, "");
    const remove = spawnSync("git", ["worktree", "remove", created.absolute], { cwd: fixture.root, encoding: "utf8" });
    assert.equal(remove.status, 0, remove.stderr);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Cursor status parser normalizes modified and renamed paths", () => {
  assert.deepEqual(parseChangedFiles(" M src/a.ts\nR  old.ts -> new.ts\n?? docs/x.md\n"), ["docs/x.md", "new.ts", "src/a.ts"]);
});
