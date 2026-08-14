import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCHEMA_VERSION = "1.1.0";
const hooksListHelper = path.join(path.dirname(fileURLToPath(import.meta.url)), "codex-hooks-list.mjs");

export function defaultRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs ?? 10000,
  });
  return {
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function check(name, status, reasonCode, detail) {
  return { name, status, reasonCode, detail };
}

function text(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
}

function report(status, reasonCode, checks) {
  return { schemaVersion: SCHEMA_VERSION, status, reasonCode, checks };
}

function normalizePath(value) {
  let resolved = path.resolve(value);
  try {
    if (fs.existsSync(resolved)) resolved = fs.realpathSync(resolved);
  } catch {}
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function samePath(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  return normalizePath(left) === normalizePath(right);
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
  }
  return value;
}

export function sameHookManifest(left, right) {
  const parsedLeft = stableJson(JSON.parse(fs.readFileSync(left, "utf8")));
  const parsedRight = stableJson(JSON.parse(fs.readFileSync(right, "utf8")));
  return JSON.stringify(parsedLeft) === JSON.stringify(parsedRight);
}

export function isProjectHookManifest(hook, expectedSource) {
  const sourcePath = hook?.sourcePath;
  if (typeof sourcePath !== "string") return false;
  if (samePath(sourcePath, expectedSource)) return true;
  return hook.source === "project"
    && path.basename(sourcePath) === "hooks.json"
    && path.basename(path.dirname(sourcePath)) === ".codex";
}

export function inspectProjectHookTrust(repoRoot, rawResult) {
  const expectedSource = path.join(path.resolve(repoRoot), ".codex/hooks.json");
  const data = rawResult?.data;
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, reasonCode: "hook_status_unavailable", detail: "Codex app-server hook status could not be inspected. Fail closed until hooks/list succeeds." };
  }
  const row = data.find((item) => samePath(item?.cwd, repoRoot));
  if (!row || !Array.isArray(row.hooks)) {
    return { ok: false, reasonCode: "hook_status_unavailable", detail: "Codex app-server hook status could not be inspected. Fail closed until hooks/list succeeds." };
  }
  if (Array.isArray(row.errors) && row.errors.length > 0) {
    return { ok: false, reasonCode: "hook_status_unavailable", detail: "Codex app-server reported hook discovery errors. Fail closed until hook status can be verified; do not continue to delegated ai:*." };
  }

  const projectHooks = row.hooks.filter((hook) => isProjectHookManifest(hook, expectedSource));
  if (projectHooks.length === 0) {
    return {
      ok: false,
      reasonCode: "project_hooks_not_discovered",
      detail: "No project hook was discovered for this repository. Confirm .codex/hooks.json, Codex version, project trust, and /hooks discovery state.",
    };
  }

  for (const hook of projectHooks) {
    if (!samePath(hook.sourcePath, expectedSource)) {
      let matches;
      try {
        matches = fs.existsSync(hook.sourcePath) && fs.existsSync(expectedSource) && sameHookManifest(expectedSource, hook.sourcePath);
      } catch {
        matches = false;
      }
      if (!matches) {
        return {
          ok: false,
          reasonCode: "project_hook_definition_mismatch",
          detail: `Codex loaded project hooks from ${hook.sourcePath}, but that manifest differs from this worktree's .codex/hooks.json. Synchronize the root-checkout project hook before delegated ai:* execution.`,
        };
      }
    }
    if (hook.enabled !== true) {
      return {
        ok: false,
        reasonCode: "project_hook_disabled",
        detail: "Project hook is discovered but not enabled. Open /hooks, review the current definition, and enable it only after a human decision.",
      };
    }
    if (hook.isManaged !== true && hook.trustStatus !== "trusted") {
      return {
        ok: false,
        reasonCode: "project_hook_not_trusted",
        detail: "Project hook current definition is not trusted. Open Codex, run /hooks, review the current project hook definition, and decide whether to trust it. Do not write user trust files or use a hook trust bypass.",
      };
    }
  }

  return {
    ok: true,
    reasonCode: null,
    detail: "Project safety hooks are discovered, enabled, and trusted.",
  };
}

export function staticCodexContract(repoRoot) {
  const configPath = path.join(repoRoot, ".codex/config.toml");
  if (!fs.existsSync(configPath)) {
    return { ok: false, detail: ".codex/config.toml is missing." };
  }
  const config = fs.readFileSync(configPath, "utf8");
  const chromeLines = [];
  let inChromeSection = false;
  for (const line of config.split(/\r?\n/)) {
    if (/^\[mcp_servers\.chrome_devtools\]\s*$/.test(line)) {
      inChromeSection = true;
      continue;
    }
    if (inChromeSection && /^\[/.test(line)) break;
    if (inChromeSection) chromeLines.push(line);
  }
  const chrome = chromeLines.join("\n");
  const required = [
    [config, /^approval_policy\s*=\s*"on-request"/m, "approval_policy=on-request"],
    [config, /^sandbox_mode\s*=\s*"workspace-write"/m, "sandbox_mode=workspace-write"],
    [config, /^network_access\s*=\s*false/m, "network_access=false"],
    [config, /^project_doc_fallback_filenames\s*=\s*\["CODEX\.md"\]/m, "project_doc_fallback_filenames=[\"CODEX.md\"]"],
    [config, /^hooks\s*=\s*true/m, "features.hooks=true"],
    [config, /^\[mcp_servers\.chrome_devtools\]/m, "chrome_devtools MCP table"],
    [chrome, /^command\s*=\s*"node"/m, "chrome_devtools command=node"],
    [chrome, /^args\s*=\s*\["scripts\/mcp\/start-chrome-devtools\.mjs"\]/m, "chrome_devtools launcher"],
    [chrome, /^enabled\s*=\s*false/m, "chrome_devtools enabled=false"],
    [chrome, /^required\s*=\s*false/m, "chrome_devtools required=false"],
  ];
  const missing = required.filter(([target, pattern]) => !pattern.test(target)).map(([, , label]) => label);

  const hooksPath = path.join(repoRoot, ".codex/hooks.json");
  if (!fs.existsSync(hooksPath)) {
    missing.push(".codex/hooks.json");
  } else {
    try {
      const data = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
      const groups = data?.hooks?.PreToolUse ?? [];
      const matcher = groups.map((item) => item.matcher ?? "").join("|");
      const commandText = JSON.stringify(groups);
      for (const name of ["Bash", "apply_patch", "Edit", "Write"]) {
        if (!matcher.includes(name)) missing.push(`PreToolUse matcher ${name}`);
      }
      if (!commandText.includes("pre_tool_use_policy.py")) missing.push("pre_tool_use_policy.py");
    } catch {
      missing.push(".codex/hooks.json parse");
    }
  }

  return {
    ok: missing.length === 0,
    detail: missing.length
      ? `Missing static contract entries: ${missing.join(", ")}`
      : "Committed Codex config and project safety hook contain the required safety settings.",
  };
}

function readHooksList(repoRoot, runner) {
  const listed = runner(process.execPath, [hooksListHelper, "--cwd", repoRoot], { cwd: repoRoot, timeoutMs: 8000 });
  if (listed.exitCode !== 0) {
    return { ok: false, reasonCode: "hook_status_unavailable", detail: text(listed) || "Codex app-server hook status could not be inspected. Fail closed until hooks/list succeeds." };
  }
  try {
    return { ok: true, result: JSON.parse(String(listed.stdout ?? "").trim()) };
  } catch {
    return { ok: false, reasonCode: "hook_status_unavailable", detail: "Codex app-server hook status could not be inspected. Fail closed until hooks/list succeeds." };
  }
}

export function collectCodexPreflight(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const runner = options.runner ?? defaultRunner;
  const checks = [];

  const contract = staticCodexContract(repoRoot);
  checks.push(check("Committed Codex contract", contract.ok ? "pass" : "fail", contract.ok ? null : "static_contract_invalid", contract.detail));
  if (!contract.ok) return report("fail", "static_contract_invalid", checks);

  const version = runner("codex", ["--version"], { cwd: repoRoot, timeoutMs: 5000 });
  if (version.exitCode !== 0) {
    checks.push(check("Codex CLI", "fail", "codex_cli_missing", "Codex CLI is required before ai:research / ai:discover / ai:evaluate-stack / ai:implement / ai:review. Install/configure it, then rerun this preflight."));
    return report("fail", "codex_cli_missing", checks);
  }
  checks.push(check("Codex CLI", "pass", null, String(version.stdout).trim().split(/\r?\n/)[0] || "available"));

  // This is intentionally an effective-config probe. Project-local .codex layers are
  // disabled by Codex when the project is untrusted, so merely parsing the committed
  // TOML would miss the failure mode that caused v11.1.0 operational incidents.
  const mcp = runner("codex", ["mcp", "list"], { cwd: repoRoot, timeoutMs: 10000 });
  const mcpText = text(mcp);
  if (/invalid transport/i.test(mcpText)) {
    checks.push(check("Codex effective MCP config", "fail", "config_invalid_transport", "Codex rejected the effective MCP configuration with `invalid transport`. Do not add partial `-c mcp_servers.*` overrides; inspect project trust and the complete MCP table."));
    return report("fail", "config_invalid_transport", checks);
  }
  if (mcp.exitCode !== 0) {
    checks.push(check("Codex effective MCP config", "fail", "mcp_list_failed", "`codex mcp list` failed. Run it directly in this repository and resolve the reported local Codex configuration error."));
    return report("fail", "mcp_list_failed", checks);
  }
  if (!/\bchrome_devtools\b/i.test(mcpText)) {
    checks.push(check("Codex project trust / effective config", "fail", "project_config_not_effective", "The committed chrome_devtools MCP is absent from `codex mcp list`. The repository is commonly untrusted or its project-local config is otherwise disabled. Open Codex in this repository, explicitly trust the project if prompted, then rerun the preflight; do not auto-edit user trust state."));
    return report("fail", "project_config_not_effective", checks);
  }
  checks.push(check("Codex project trust / effective config", "pass", null, "Project-local MCP configuration is visible through Codex's effective config."));

  // Current Codex CLI renders an enabled/disabled status in `mcp list`. Keep this
  // check bounded to the chrome_devtools row so unrelated user MCPs cannot satisfy it.
  const lines = mcpText.split(/\r?\n/).filter((line) => /\bchrome_devtools\b/i.test(line));
  const chromeRow = lines.join(" ");
  if (!/\bdisabled\b/i.test(chromeRow)) {
    checks.push(check("Chrome MCP default state", "fail", "chrome_mcp_not_disabled", "chrome_devtools is visible but is not reported as disabled. The harness requires it disabled-by-default for Codex roles; browser evidence is enabled separately when explicitly needed."));
    return report("fail", "chrome_mcp_not_disabled", checks);
  }
  checks.push(check("Chrome MCP default state", "pass", null, "chrome_devtools is configured with a complete transport and disabled by default."));

  const listed = readHooksList(repoRoot, runner);
  if (!listed.ok) {
    checks.push(check("Codex project hook trust", "fail", listed.reasonCode, listed.detail));
    return report("fail", listed.reasonCode, checks);
  }
  const trust = inspectProjectHookTrust(repoRoot, listed.result);
  checks.push(check("Codex project hook trust", trust.ok ? "pass" : "fail", trust.reasonCode, trust.detail));
  if (!trust.ok) return report("fail", trust.reasonCode, checks);

  return report("pass", null, checks);
}

function main() {
  const collected = collectCodexPreflight();
  console.log("Codex effective-config preflight\n");
  for (const item of collected.checks) console.log(`[${item.status.toUpperCase()}] ${item.name}: ${item.detail}`);
  if (collected.reasonCode) console.log(`reasonCode: ${collected.reasonCode}`);
  process.exitCode = collected.status === "pass" ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
