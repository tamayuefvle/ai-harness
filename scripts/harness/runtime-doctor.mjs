import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { collectCodexPreflight } from "./codex-preflight.mjs";

export const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function defaultRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    input: options.input,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: options.timeoutMs ?? 10000,
  });
  return { exitCode: Number.isInteger(result.status) ? result.status : 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function add(checks, name, status, detail) { checks.push({ name, status, detail }); }

function parseHookDecision(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return null;
  try { return JSON.parse(text)?.hookSpecificOutput?.permissionDecision ?? null; } catch { return "invalid-json"; }
}

function policyEvent(toolInput) {
  return JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: toolInput });
}

function findPython(runner, repoRoot) {
  for (const candidate of [["python3", []], ["python", []], ["py", ["-3"]]]) {
    const result = runner(candidate[0], [...candidate[1], "--version"], { cwd: repoRoot, timeoutMs: 5000 });
    const versionText = `${result.stdout ?? ""} ${result.stderr ?? ""}`;
    if (result.exitCode === 0 && /Python\s+3(?:\.|\s|$)/i.test(versionText)) return candidate;
  }
  return null;
}

export function collectRuntimeDoctor(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const runner = options.runner ?? defaultRunner;
  const checks = [];

  const configPath = path.join(repoRoot, ".codex/config.toml");
  const hooksPath = path.join(repoRoot, ".codex/hooks.json");
  const policyPath = path.join(repoRoot, ".codex/hooks/pre_tool_use_policy.py");

  if (!fs.existsSync(configPath)) add(checks, "Codex config", "fail", ".codex/config.toml is missing.");
  else {
    const text = fs.readFileSync(configPath, "utf8");
    const required = [
      [/^approval_policy\s*=\s*"on-request"/m, "approval_policy=on-request"],
      [/^sandbox_mode\s*=\s*"workspace-write"/m, "sandbox_mode=workspace-write"],
      [/^network_access\s*=\s*false/m, "network_access=false"],
      [/^hooks\s*=\s*true/m, "hooks=true"],
    ];
    const missing = required.filter(([pattern]) => !pattern.test(text)).map(([, label]) => label);
    add(checks, "Codex config", missing.length ? "fail" : "pass", missing.length ? `Missing: ${missing.join(", ")}` : "approval, sandbox, network, and hooks settings are present.");
  }

  if (!fs.existsSync(hooksPath)) add(checks, "PreToolUse hook config", "fail", ".codex/hooks.json is missing.");
  else {
    try {
      const data = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
      const groups = data?.hooks?.PreToolUse ?? [];
      const matcher = groups.map((item) => item.matcher ?? "").join("|");
      const commandText = JSON.stringify(groups);
      const missing = ["Bash", "apply_patch", "Edit", "Write"].filter((name) => !matcher.includes(name));
      const referencesPolicy = commandText.includes("pre_tool_use_policy.py");
      add(checks, "PreToolUse hook config", missing.length || !referencesPolicy ? "fail" : "pass", missing.length ? `Matcher missing: ${missing.join(", ")}` : referencesPolicy ? "Tool matcher and policy command are configured." : "Policy command is not configured.");
    } catch (error) {
      add(checks, "PreToolUse hook config", "fail", `Invalid hooks JSON: ${error.message}`);
    }
  }

  const python = findPython(runner, repoRoot);
  if (!python) add(checks, "Hook Python runtime", "fail", "Python 3 is required by the committed Codex safety hook.");
  else if (!fs.existsSync(policyPath)) add(checks, "Hook policy", "fail", ".codex/hooks/pre_tool_use_policy.py is missing.");
  else {
    add(checks, "Hook Python runtime", "pass", python[0]);
    const runPolicy = (event) => runner(python[0], [...python[1], policyPath], { cwd: repoRoot, input: event, timeoutMs: 5000 });
    const dangerousCommand = ["git", "reset", "--hard"].join(" ");
    const safe = runPolicy(policyEvent({ command: "git status --short" }));
    const denied = runPolicy(policyEvent({ command: dangerousCommand }));
    const generatedWrite = runPolicy(policyEvent({ file_path: "AGENTS.md", content: "direct edit" }));
    add(checks, "Hook allows safe command", safe.exitCode === 0 && !String(safe.stdout).trim() ? "pass" : "fail", "Synthetic safe command produced no deny decision.");
    add(checks, "Hook denies destructive Git", denied.exitCode === 0 && parseHookDecision(denied.stdout) === "deny" ? "pass" : "fail", "Synthetic destructive Git command must return deny.");
    add(checks, "Hook protects generated rules", generatedWrite.exitCode === 0 && parseHookDecision(generatedWrite.stdout) === "deny" ? "pass" : "fail", "Synthetic AGENTS.md write must return deny.");
  }

  const codex = runner("codex", ["--version"], { cwd: repoRoot, timeoutMs: 5000 });
  add(checks, "Codex CLI", codex.exitCode === 0 ? "pass" : "warn", codex.exitCode === 0 ? String(codex.stdout).trim().split(/\r?\n/)[0] : "Codex CLI is not installed in this environment; effective project trust/config was not exercised.");
  if (codex.exitCode === 0) {
    const effective = collectCodexPreflight({ repoRoot, runner });
    for (const item of effective.checks.filter((item) => item.name !== "Codex CLI" && item.name !== "Committed Codex contract")) {
      add(checks, `Effective ${item.name}`, item.status, item.detail);
    }
  }
  return { schemaVersion: "1.1.0", checks };
}

function main() {
  const report = collectRuntimeDoctor();
  console.log("Harness runtime doctor\n");
  for (const item of report.checks) console.log(`[${item.status.toUpperCase()}] ${item.name}: ${item.detail}`);
  process.exitCode = report.checks.some((item) => item.status === "fail") ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

