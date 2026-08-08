import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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
    [config, /^hooks\s*=\s*true/m, "features.hooks=true"],
    [config, /^\[mcp_servers\.chrome_devtools\]/m, "chrome_devtools MCP table"],
    [chrome, /^command\s*=\s*"node"/m, "chrome_devtools command=node"],
    [chrome, /^args\s*=\s*\["scripts\/mcp\/start-chrome-devtools\.mjs"\]/m, "chrome_devtools launcher"],
    [chrome, /^enabled\s*=\s*false/m, "chrome_devtools enabled=false"],
    [chrome, /^required\s*=\s*false/m, "chrome_devtools required=false"],
  ];
  const missing = required.filter(([target, pattern]) => !pattern.test(target)).map(([, , label]) => label);
  return {
    ok: missing.length === 0,
    detail: missing.length ? `Missing static contract entries: ${missing.join(", ")}` : "Committed Codex config contains the full disabled-by-default Chrome MCP transport and safety settings.",
  };
}

export function collectCodexPreflight(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const runner = options.runner ?? defaultRunner;
  const checks = [];

  const contract = staticCodexContract(repoRoot);
  checks.push(check("Committed Codex contract", contract.ok ? "pass" : "fail", contract.ok ? null : "static_contract_invalid", contract.detail));
  if (!contract.ok) return { schemaVersion: "1.0.0", status: "fail", reasonCode: "static_contract_invalid", checks };

  const version = runner("codex", ["--version"], { cwd: repoRoot, timeoutMs: 5000 });
  if (version.exitCode !== 0) {
    checks.push(check("Codex CLI", "fail", "codex_cli_missing", "Codex CLI is required before ai:research / ai:implement / ai:review. Install/configure it, then rerun this preflight."));
    return { schemaVersion: "1.0.0", status: "fail", reasonCode: "codex_cli_missing", checks };
  }
  checks.push(check("Codex CLI", "pass", null, String(version.stdout).trim().split(/\r?\n/)[0] || "available"));

  // This is intentionally an effective-config probe. Project-local .codex layers are
  // disabled by Codex when the project is untrusted, so merely parsing the committed
  // TOML would miss the failure mode that caused v11.1.0 operational incidents.
  const mcp = runner("codex", ["mcp", "list"], { cwd: repoRoot, timeoutMs: 10000 });
  const mcpText = text(mcp);
  if (/invalid transport/i.test(mcpText)) {
    checks.push(check("Codex effective MCP config", "fail", "config_invalid_transport", "Codex rejected the effective MCP configuration with `invalid transport`. Do not add partial `-c mcp_servers.*` overrides; inspect project trust and the complete MCP table."));
    return { schemaVersion: "1.0.0", status: "fail", reasonCode: "config_invalid_transport", checks };
  }
  if (mcp.exitCode !== 0) {
    checks.push(check("Codex effective MCP config", "fail", "mcp_list_failed", "`codex mcp list` failed. Run it directly in this repository and resolve the reported local Codex configuration error."));
    return { schemaVersion: "1.0.0", status: "fail", reasonCode: "mcp_list_failed", checks };
  }
  if (!/\bchrome_devtools\b/i.test(mcpText)) {
    checks.push(check("Codex project trust / effective config", "fail", "project_config_not_effective", "The committed chrome_devtools MCP is absent from `codex mcp list`. The repository is commonly untrusted or its project-local config is otherwise disabled. Open Codex in this repository, explicitly trust the project if prompted, then rerun the preflight; do not auto-edit user trust state."));
    return { schemaVersion: "1.0.0", status: "fail", reasonCode: "project_config_not_effective", checks };
  }
  checks.push(check("Codex project trust / effective config", "pass", null, "Project-local MCP configuration is visible through Codex's effective config."));

  // Current Codex CLI renders an enabled/disabled status in `mcp list`. Keep this
  // check bounded to the chrome_devtools row so unrelated user MCPs cannot satisfy it.
  const lines = mcpText.split(/\r?\n/).filter((line) => /\bchrome_devtools\b/i.test(line));
  const chromeRow = lines.join(" ");
  if (!/\bdisabled\b/i.test(chromeRow)) {
    checks.push(check("Chrome MCP default state", "fail", "chrome_mcp_not_disabled", "chrome_devtools is visible but is not reported as disabled. The harness requires it disabled-by-default for Codex roles; browser evidence is enabled separately when explicitly needed."));
    return { schemaVersion: "1.0.0", status: "fail", reasonCode: "chrome_mcp_not_disabled", checks };
  }
  checks.push(check("Chrome MCP default state", "pass", null, "chrome_devtools is configured with a complete transport and disabled by default."));

  return { schemaVersion: "1.0.0", status: "pass", reasonCode: null, checks };
}

function main() {
  const report = collectCodexPreflight();
  console.log("Codex effective-config preflight\n");
  for (const item of report.checks) console.log(`[${item.status.toUpperCase()}] ${item.name}: ${item.detail}`);
  if (report.reasonCode) console.log(`reasonCode: ${report.reasonCode}`);
  process.exitCode = report.status === "pass" ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

