import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runCursorExec } from "./cursor-exec.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
  return result;
}

function fixtureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-exec-"));
  for (const relative of [
    "harness/cursor",
    "harness/policies",
    "harness/schemas",
    ".cursor",
    "docs",
  ]) {
    fs.mkdirSync(path.join(root, relative), { recursive: true });
  }
  fs.copyFileSync(
    path.join(packageRoot, "harness/cursor/manifest.json"),
    path.join(root, "harness/cursor/manifest.json"),
  );
  fs.copyFileSync(
    path.join(packageRoot, "harness/policies/command-guardrails.json"),
    path.join(root, "harness/policies/command-guardrails.json"),
  );
  fs.copyFileSync(path.join(packageRoot, ".cursor/cli.json"), path.join(root, ".cursor/cli.json"));
  fs.copyFileSync(path.join(packageRoot, ".cursor/hooks.json"), path.join(root, ".cursor/hooks.json"));
  fs.writeFileSync(path.join(root, "tracked.txt"), "base\n");
  fs.writeFileSync(path.join(root, "docs/prompt.md"), "Inspect the repository and summarize boundaries.\n");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "harness@example.invalid"]);
  git(root, ["config", "user.name", "Harness Test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "fixture"]);
  return root;
}

/**
 * Real git for worktree isolation; mocked Cursor binary for provider-free E2E.
 * `writeMode`: none | leak | implement
 */
function hybridRunner({ writeMode = "none" } = {}) {
  return (command, args, options = {}) => {
    if (command === "agent" || command === "cursor-agent") {
      const joined = args.join(" ");
      if (joined === "--version") return { exitCode: 0, stdout: "2026.08.0-fixture\n", stderr: "" };
      if (joined === "--help") {
        return { exitCode: 0, stdout: "-p, --print\n--output-format <format>\n", stderr: "" };
      }
      if (args.includes("-p")) {
        const cwd = options.cwd;
        assert.ok(cwd, "Cursor CLI must run inside the linked worktree");
        if (writeMode === "leak" || writeMode === "implement") {
          fs.writeFileSync(path.join(cwd, "agent-change.txt"), `${writeMode}\n`);
        }
        const forced = args.includes("--force");
        return {
          exitCode: 0,
          stdout: JSON.stringify({ ok: true, forced, cwd }),
          stderr: "",
        };
      }
      return { exitCode: 1, stdout: "", stderr: `unexpected agent args: ${joined}` };
    }
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      encoding: "utf8",
      timeout: options.timeoutMs ?? 30000,
    });
    return {
      exitCode: Number.isInteger(result.status) ? result.status : 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  };
}

function passedPreflight() {
  return { status: "pass", reasonCode: null, binary: "agent", checks: [] };
}

test("cursor:exec read-only clean run removes worktree and never auto-applies", () => {
  const root = fixtureRepo();
  try {
    const result = runCursorExec(
      root,
      { role: "read-only", runId: "ro-clean", promptFile: "docs/prompt.md" },
      { runner: hybridRunner({ writeMode: "none" }), preflight: passedPreflight() },
    );
    assert.equal(result.status, "passed");
    assert.equal(result.worktree.autoApplied, false);
    assert.equal(result.worktree.preserved, false);
    assert.deepEqual(result.changedFiles, []);
    assert.equal(fs.existsSync(path.join(root, ".harness/reports/cursor/ro-clean/result.json")), true);
    assert.equal(fs.existsSync(path.join(root, "agent-change.txt")), false);
    const common = git(root, ["rev-parse", "--git-common-dir"]).stdout.trim();
    const worktreePath = path.isAbsolute(common)
      ? path.join(common, "harness-worktrees/cursor/ro-clean")
      : path.join(root, common, "harness-worktrees/cursor/ro-clean");
    assert.equal(fs.existsSync(worktreePath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cursor:exec read-only blocks when the worker changes files", () => {
  const root = fixtureRepo();
  try {
    const result = runCursorExec(
      root,
      { role: "read-only", runId: "ro-leak", promptFile: "docs/prompt.md" },
      { runner: hybridRunner({ writeMode: "leak" }), preflight: passedPreflight() },
    );
    assert.equal(result.status, "blocked");
    assert.match(result.failureReason, /Read-only Cursor worker changed files/);
    assert.ok(result.changedFiles.includes("agent-change.txt"));
    assert.equal(result.worktree.autoApplied, false);
    assert.equal(result.worktree.preserved, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cursor:exec implementer preserves isolated worktree with --force and no auto-apply", () => {
  const root = fixtureRepo();
  try {
    const result = runCursorExec(
      root,
      { role: "implementer", runId: "impl-001", promptFile: "docs/prompt.md" },
      { runner: hybridRunner({ writeMode: "implement" }), preflight: passedPreflight() },
    );
    assert.equal(result.status, "passed");
    assert.equal(result.worktree.autoApplied, false);
    assert.equal(result.worktree.preserved, true);
    assert.ok(result.changedFiles.includes("agent-change.txt"));
    assert.equal(fs.existsSync(path.join(root, "agent-change.txt")), false);

    const common = git(root, ["rev-parse", "--git-common-dir"]).stdout.trim();
    const worktreePath = path.isAbsolute(common)
      ? path.join(common, "harness-worktrees/cursor/impl-001")
      : path.join(root, common, "harness-worktrees/cursor/impl-001");
    assert.equal(fs.existsSync(worktreePath), true);
    assert.equal(fs.existsSync(path.join(worktreePath, "agent-change.txt")), true);
    assert.equal(fs.existsSync(path.join(worktreePath, ".cursor/cli.json")), true);

    const raw = JSON.parse(fs.readFileSync(path.join(root, ".harness/reports/cursor/impl-001/raw.json"), "utf8"));
    assert.equal(raw.forced, true);

    git(root, ["worktree", "remove", "--force", worktreePath]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cursor:exec fails closed when preflight is not pass", () => {
  const root = fixtureRepo();
  try {
    assert.throws(
      () =>
        runCursorExec(
          root,
          { role: "read-only", runId: "preflight-fail", promptFile: "docs/prompt.md" },
          {
            runner: hybridRunner(),
            preflight: { status: "fail", reasonCode: "dirty_base", binary: "agent", checks: [] },
          },
        ),
      /Cursor preflight failed: dirty_base/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
