import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectCodexPreflight } from "./codex-preflight.mjs";

const HOOKS_FIXTURE = {
  hooks: {
    PreToolUse: [
      {
        matcher: "Bash|apply_patch|Edit|Write",
        hooks: [
          {
            type: "command",
            command: "python3 .codex/hooks/pre_tool_use_policy.py",
          },
        ],
      },
    ],
  },
};

function fixture(hooksJson = HOOKS_FIXTURE) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-preflight-"));
  fs.mkdirSync(path.join(root, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(root, ".codex/config.toml"), `approval_policy = "on-request"\nsandbox_mode = "workspace-write"\nproject_doc_fallback_filenames = ["CODEX.md"]\n[sandbox_workspace_write]\nnetwork_access = false\n[features]\nhooks = true\n[mcp_servers.chrome_devtools]\ncommand = "node"\nargs = ["scripts/mcp/start-chrome-devtools.mjs"]\nenabled = false\nrequired = false\n`);
  fs.writeFileSync(path.join(root, ".codex/hooks.json"), `${JSON.stringify(hooksJson, null, 2)}\n`);
  return root;
}

function projectHookRow(root, overrides = {}) {
  const sourcePath = overrides.sourcePath ?? path.join(root, ".codex/hooks.json");
  return {
    cwd: root,
    errors: [],
    hooks: [{
      source: "project",
      sourcePath,
      enabled: true,
      isManaged: false,
      currentHash: "abc",
      trustStatus: "trusted",
      ...overrides,
      sourcePath,
    }],
  };
}

function hooksResult(root, overrides = {}) {
  return { data: [projectHookRow(root, overrides)] };
}

function runnerFor({ mcp = "chrome_devtools  node  scripts/mcp/start-chrome-devtools.mjs  disabled  Unsupported", mcpExit = 0, mcpErr = "", versionExit = 0, hooksList, hooksExit = 0, hooksErr = "" } = {}) {
  return (command, args) => {
    if (command === "codex" && args.join(" ") === "--version") return { exitCode: versionExit, stdout: versionExit ? "" : "codex-cli 0.147.0\n", stderr: "" };
    if (command === "codex" && args.join(" ") === "mcp list") return { exitCode: mcpExit, stdout: mcp, stderr: mcpErr };
    if (String(args[0] ?? "").endsWith("codex-hooks-list.mjs")) {
      if (typeof hooksList === "string" || hooksExit !== 0) {
        return { exitCode: hooksExit, stdout: typeof hooksList === "string" ? hooksList : "", stderr: hooksErr };
      }
      return { exitCode: 0, stdout: `${JSON.stringify(hooksList)}\n`, stderr: "" };
    }
    return { exitCode: 1, stdout: "", stderr: "unexpected" };
  };
}

test("passes when effective MCP, disabled Chrome, and trusted project hook are present", () => {
  const root = fixture();
  const report = collectCodexPreflight({ repoRoot: root, runner: runnerFor({ hooksList: hooksResult(root) }) });
  assert.equal(report.status, "pass");
  assert.equal(report.reasonCode, null);
  assert.equal(report.schemaVersion, "1.1.0");
});

test("fails clearly when the project config is not effective (typical untrusted project)", () => {
  const root = fixture();
  const report = collectCodexPreflight({ repoRoot: root, runner: runnerFor({ mcp: "No MCP servers configured", hooksList: hooksResult(root) }) });
  assert.equal(report.status, "fail");
  assert.equal(report.reasonCode, "project_config_not_effective");
  assert.equal(report.schemaVersion, "1.1.0");
});

test("recognizes the partial MCP override invalid-transport regression", () => {
  const root = fixture();
  const report = collectCodexPreflight({
    repoRoot: root,
    runner: runnerFor({ mcp: "", mcpExit: 1, mcpErr: "Error loading config.toml: invalid transport in mcp_servers.chrome_devtools", hooksList: hooksResult(root) }),
  });
  assert.equal(report.reasonCode, "config_invalid_transport");
  assert.equal(report.schemaVersion, "1.1.0");
});

test("fails when chrome MCP is effective but enabled", () => {
  const root = fixture();
  const report = collectCodexPreflight({ repoRoot: root, runner: runnerFor({ mcp: "chrome_devtools  node  launcher  enabled  Unsupported", hooksList: hooksResult(root) }) });
  assert.equal(report.reasonCode, "chrome_mcp_not_disabled");
});

test("fails before runtime probing when committed config is incomplete", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, ".codex/config.toml"), 'approval_policy = "on-request"\n');
  const report = collectCodexPreflight({ repoRoot: root, runner: runnerFor({ hooksList: hooksResult(root) }) });
  assert.equal(report.reasonCode, "static_contract_invalid");
  assert.equal(report.schemaVersion, "1.1.0");
});

test("fails when the project hook is untrusted", () => {
  const root = fixture();
  const report = collectCodexPreflight({ repoRoot: root, runner: runnerFor({ hooksList: hooksResult(root, { trustStatus: "untrusted" }) }) });
  assert.equal(report.reasonCode, "project_hook_not_trusted");
  assert.match(report.checks.at(-1).detail, /\/hooks/);
});

test("fails when the project hook is disabled", () => {
  const root = fixture();
  const report = collectCodexPreflight({ repoRoot: root, runner: runnerFor({ hooksList: hooksResult(root, { enabled: false }) }) });
  assert.equal(report.reasonCode, "project_hook_disabled");
});

test("fails closed when hooks/list cannot be inspected", () => {
  const root = fixture();
  const missing = collectCodexPreflight({ repoRoot: root, runner: runnerFor({ hooksExit: 1, hooksErr: "app-server unavailable" }) });
  assert.equal(missing.reasonCode, "hook_status_unavailable");
  assert.equal(missing.schemaVersion, "1.1.0");

  const mismatchedCwd = collectCodexPreflight({
    repoRoot: root,
    runner: runnerFor({
      hooksList: {
        data: [{
          cwd: "/tmp/not-the-requested-repo",
          errors: [],
          hooks: [{
            source: "project",
            sourcePath: path.join(root, ".codex/hooks.json"),
            enabled: true,
            isManaged: false,
            currentHash: "abc",
            trustStatus: "trusted",
          }],
        }],
      },
    }),
  });
  assert.equal(mismatchedCwd.reasonCode, "hook_status_unavailable");
});

test("fails when the expected project hook manifest is absent", () => {
  const root = fixture();
  const report = collectCodexPreflight({
    repoRoot: root,
    runner: runnerFor({
      hooksList: {
        data: [{
          cwd: root,
          errors: [],
          hooks: [{
            source: "user",
            sourcePath: path.join(os.homedir(), ".codex/hooks.json"),
            enabled: true,
            isManaged: false,
            currentHash: "abc",
            trustStatus: "trusted",
          }],
        }],
      },
    }),
  });
  assert.equal(report.reasonCode, "project_hooks_not_discovered");
});

test("passes when a linked worktree root-checkout hook manifest matches this worktree", () => {
  const root = fixture();
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "codex-root-checkout-"));
  const alternate = path.join(checkout, ".codex/hooks.json");
  fs.mkdirSync(path.dirname(alternate), { recursive: true });
  const reordered = {
    hooks: {
      PreToolUse: [{
        hooks: [{ command: "python3 .codex/hooks/pre_tool_use_policy.py", type: "command" }],
        matcher: "Bash|apply_patch|Edit|Write",
      }],
    },
  };
  fs.writeFileSync(alternate, `${JSON.stringify(reordered)}\n`);
  const report = collectCodexPreflight({
    repoRoot: root,
    runner: runnerFor({ hooksList: hooksResult(root, { sourcePath: alternate }) }),
  });
  assert.equal(report.status, "pass");
  assert.equal(report.reasonCode, null);
});

test("fails when a linked worktree root-checkout hook manifest differs from this worktree", () => {
  const root = fixture();
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "codex-root-checkout-"));
  const alternate = path.join(checkout, ".codex/hooks.json");
  fs.mkdirSync(path.dirname(alternate), { recursive: true });
  fs.writeFileSync(alternate, `${JSON.stringify({ hooks: { PreToolUse: [] } }, null, 2)}\n`);
  const report = collectCodexPreflight({
    repoRoot: root,
    runner: runnerFor({ hooksList: hooksResult(root, { sourcePath: alternate }) }),
  });
  assert.equal(report.reasonCode, "project_hook_definition_mismatch");
});
