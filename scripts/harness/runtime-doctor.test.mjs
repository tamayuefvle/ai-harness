import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectRuntimeDoctor } from "./runtime-doctor.mjs";

function rootFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-doctor-"));
  fs.mkdirSync(path.join(root, ".codex/hooks"), { recursive: true });
  fs.writeFileSync(path.join(root, ".codex/config.toml"), 'approval_policy = "on-request"\nsandbox_mode = "workspace-write"\nproject_doc_fallback_filenames = ["CODEX.md"]\n[sandbox_workspace_write]\nnetwork_access = false\n[features]\nhooks = true\n[mcp_servers.chrome_devtools]\ncommand = "node"\nargs = ["scripts/mcp/start-chrome-devtools.mjs"]\nenabled = false\nrequired = false\n');
  fs.writeFileSync(path.join(root, ".codex/hooks.json"), JSON.stringify({
    hooks: {
      PreToolUse: [{
        matcher: "Bash|apply_patch|Edit|Write",
        hooks: [{ type: "command", command: "python3 .codex/hooks/pre_tool_use_policy.py" }],
      }],
    },
  }));
  fs.writeFileSync(path.join(root, ".codex/hooks/pre_tool_use_policy.py"), "# fixture\n");
  return root;
}

function makeRunner(root) {
  return (command, args, options = {}) => {
    if (["python3", "python", "py"].includes(command) && args.at(-1) === "--version") return { exitCode: command === "python3" ? 0 : 1, stdout: "Python 3.13\n", stderr: "" };
    if (command === "python3") {
      const input = String(options.input ?? "");
      if (input.includes("reset") || input.includes("AGENTS.md")) return { exitCode: 0, stdout: JSON.stringify({ hookSpecificOutput: { permissionDecision: "deny" } }), stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    if (command === "codex" && args.join(" ") === "--version") return { exitCode: 0, stdout: "codex-cli 0.147.0\n", stderr: "" };
    if (command === "codex" && args.join(" ") === "mcp list") return { exitCode: 0, stdout: "chrome_devtools  node  launcher  disabled  Unsupported\n", stderr: "" };
    if (String(args[0] ?? "").endsWith("codex-hooks-list.mjs")) {
      return {
        exitCode: 0,
        stdout: `${JSON.stringify({
          data: [{
            cwd: root,
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
        })}\n`,
        stderr: "",
      };
    }
    return { exitCode: 1, stdout: "", stderr: "unexpected" };
  };
}

test("validates static Codex safety contract, hook trust, and direct hook behavior", () => {
  const root = rootFixture();
  const report = collectRuntimeDoctor({ repoRoot: root, runner: makeRunner(root) });
  assert.equal(report.checks.some((item) => item.status === "fail"), false);
  assert.equal(report.checks.find((item) => item.name === "Codex CLI").status, "pass");
  assert.equal(report.checks.find((item) => item.name === "Effective Codex project trust / effective config").status, "pass");
  assert.equal(report.checks.find((item) => item.name === "Effective Codex project hook trust").status, "pass");
});

test("fails when network isolation is removed", () => {
  const root = rootFixture();
  fs.writeFileSync(path.join(root, ".codex/config.toml"), 'approval_policy = "on-request"\nsandbox_mode = "workspace-write"\nhooks = true\n');
  const report = collectRuntimeDoctor({ repoRoot: root, runner: makeRunner(root) });
  assert.equal(report.checks.find((item) => item.name === "Codex config").status, "fail");
});
