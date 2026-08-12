import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectCodexPreflight } from "./codex-preflight.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-preflight-"));
  fs.mkdirSync(path.join(root, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(root, ".codex/config.toml"), `approval_policy = "on-request"\nsandbox_mode = "workspace-write"\nproject_doc_fallback_filenames = ["CODEX.md"]\n[sandbox_workspace_write]\nnetwork_access = false\n[features]\nhooks = true\n[mcp_servers.chrome_devtools]\ncommand = "node"\nargs = ["scripts/mcp/start-chrome-devtools.mjs"]\nenabled = false\nrequired = false\n`);
  return root;
}

function runnerFor({ mcp = "chrome_devtools  node  scripts/mcp/start-chrome-devtools.mjs  disabled  Unsupported", mcpExit = 0, mcpErr = "", versionExit = 0 } = {}) {
  return (command, args) => {
    if (command === "codex" && args.join(" ") === "--version") return { exitCode: versionExit, stdout: versionExit ? "" : "codex-cli 0.147.0\n", stderr: "" };
    if (command === "codex" && args.join(" ") === "mcp list") return { exitCode: mcpExit, stdout: mcp, stderr: mcpErr };
    return { exitCode: 1, stdout: "", stderr: "unexpected" };
  };
}

test("passes only when project-local MCP is effective and disabled", () => {
  const report = collectCodexPreflight({ repoRoot: fixture(), runner: runnerFor() });
  assert.equal(report.status, "pass");
  assert.equal(report.reasonCode, null);
});

test("fails clearly when the project config is not effective (typical untrusted project)", () => {
  const report = collectCodexPreflight({ repoRoot: fixture(), runner: runnerFor({ mcp: "No MCP servers configured" }) });
  assert.equal(report.status, "fail");
  assert.equal(report.reasonCode, "project_config_not_effective");
});

test("recognizes the partial MCP override invalid-transport regression", () => {
  const report = collectCodexPreflight({ repoRoot: fixture(), runner: runnerFor({ mcp: "", mcpExit: 1, mcpErr: "Error loading config.toml: invalid transport in mcp_servers.chrome_devtools" }) });
  assert.equal(report.reasonCode, "config_invalid_transport");
});

test("fails when chrome MCP is effective but enabled", () => {
  const report = collectCodexPreflight({ repoRoot: fixture(), runner: runnerFor({ mcp: "chrome_devtools  node  launcher  enabled  Unsupported" }) });
  assert.equal(report.reasonCode, "chrome_mcp_not_disabled");
});

test("fails before runtime probing when committed config is incomplete", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, ".codex/config.toml"), 'approval_policy = "on-request"\n');
  const report = collectCodexPreflight({ repoRoot: root, runner: runnerFor() });
  assert.equal(report.reasonCode, "static_contract_invalid");
});
