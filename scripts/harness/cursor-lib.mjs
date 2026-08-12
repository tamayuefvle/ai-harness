import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildPolicyOutputs, cursorPermissionsForRole, loadCommandGuardrails } from "./policy-lib.mjs";

export function loadCursorManifest(repoRoot) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, "harness/cursor/manifest.json"), "utf8"));
}

export function defaultRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs ?? 10000,
    shell: false,
    windowsHide: true,
  });
  return {
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null,
  };
}

export function resolveCursorBinary(repoRoot, runner = defaultRunner) {
  const manifest = loadCursorManifest(repoRoot);
  for (const candidate of manifest.binaryCandidates) {
    const result = runner(candidate, ["--version"], { cwd: repoRoot, timeoutMs: 5000 });
    if (result.exitCode === 0) return { binary: candidate, version: String(result.stdout).trim().split(/\r?\n/)[0] || "available" };
  }
  return null;
}

export function staticCursorContract(repoRoot) {
  const manifest = loadCursorManifest(repoRoot);
  const expected = buildPolicyOutputs(repoRoot);
  const failures = [];
  for (const relative of [manifest.projectConfig, manifest.hooksConfig]) {
    const target = path.join(repoRoot, relative);
    if (!fs.existsSync(target)) failures.push(`${relative}: missing`);
    else if (fs.readFileSync(target, "utf8") !== expected.get(relative)) failures.push(`${relative}: out of sync`);
  }
  const forceByRole = manifest.nonInteractive.forceByRole ?? {};
  if (forceByRole["read-only"] !== false || forceByRole.reviewer !== false || forceByRole.implementer !== true) failures.push("Cursor CLI --force must be disabled for read-only/reviewer and enabled only for the isolated implementer role.");
  if (manifest.isolation.autoApplyToPrimaryWorktree !== false) failures.push("Cursor CLI worktrees must never auto-apply to the primary worktree.");
  if (manifest.hookReliability.hardBoundary !== false) failures.push("Cursor hooks must not be represented as the sole hard boundary while known reliability issues remain.");
  return { ok: failures.length === 0, failures };
}

export function collectCursorPreflight(repoRoot, options = {}) {
  const runner = options.runner ?? defaultRunner;
  const checks = [];
  const contract = staticCursorContract(repoRoot);
  checks.push({ name: "Committed Cursor contract", status: contract.ok ? "pass" : "fail", detail: contract.ok ? "Project permissions/hooks match canonical policy projections." : contract.failures.join("; ") });
  if (!contract.ok) return { status: "fail", reasonCode: "static_contract_invalid", binary: null, checks };

  const binaryInfo = resolveCursorBinary(repoRoot, runner);
  if (!binaryInfo) {
    checks.push({ name: "Cursor CLI", status: "fail", detail: "Neither `agent` nor `cursor-agent` is available on PATH." });
    return { status: "fail", reasonCode: "cursor_cli_missing", binary: null, checks };
  }
  checks.push({ name: "Cursor CLI", status: "pass", detail: `${binaryInfo.binary}: ${binaryInfo.version}` });

  const help = runner(binaryInfo.binary, ["--help"], { cwd: repoRoot, timeoutMs: 5000 });
  const helpText = `${help.stdout}\n${help.stderr}`;
  if (help.exitCode !== 0 || !/--output-format/.test(helpText) || !/(--print|-p\b)/.test(helpText)) {
    checks.push({ name: "Headless JSON support", status: "fail", detail: "Installed Cursor CLI does not expose required print/output-format options." });
    return { status: "fail", reasonCode: "cursor_cli_incompatible", binary: binaryInfo.binary, checks };
  }
  checks.push({ name: "Headless JSON support", status: "pass", detail: "Print mode and structured output options are available." });

  const gitRoot = runner("git", ["rev-parse", "--show-toplevel"], { cwd: repoRoot, timeoutMs: 5000 });
  if (gitRoot.exitCode !== 0) {
    checks.push({ name: "Git worktree isolation", status: "fail", detail: "Repository must be a Git worktree before Cursor CLI execution." });
    return { status: "fail", reasonCode: "git_repository_required", binary: binaryInfo.binary, checks };
  }
  checks.push({ name: "Git worktree isolation", status: "pass", detail: "Git repository detected; harness-managed linked worktrees are available." });

  const status = runner("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repoRoot, timeoutMs: 5000 });
  const dirty = String(status.stdout).trim();
  if (status.exitCode !== 0 || dirty) {
    checks.push({ name: "Clean base", status: "fail", detail: "Cursor CLI isolation requires a clean committed base so the linked worktree cannot silently omit local changes." });
    return { status: "fail", reasonCode: "dirty_base", binary: binaryInfo.binary, checks };
  }
  checks.push({ name: "Clean base", status: "pass", detail: "Primary worktree is clean." });
  return { status: "pass", reasonCode: null, binary: binaryInfo.binary, checks };
}


export function resolveGitCommonDir(repoRoot, runner = defaultRunner) {
  const result = runner("git", ["rev-parse", "--git-common-dir"], { cwd: repoRoot, timeoutMs: 5000 });
  if (result.exitCode !== 0) throw new Error(`Unable to resolve Git common dir: ${String(result.stderr || result.stdout).trim()}`);
  const raw = String(result.stdout).trim();
  if (!raw) throw new Error("Git common dir was empty.");
  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(repoRoot, raw);
}

export function createCursorWorktree(repoRoot, runId, baseHead, runner = defaultRunner) {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(runId ?? "")) throw new Error("Cursor runId must match ^[A-Za-z0-9._-]{1,80}$");
  if (!/^[0-9a-f]{7,64}$/i.test(baseHead ?? "")) throw new Error("Cursor baseHead must be a Git object id.");
  const manifest = loadCursorManifest(repoRoot);
  if (manifest.isolation.location !== "git-common-dir") throw new Error(`Unsupported Cursor isolation location: ${manifest.isolation.location}`);
  const commonDir = resolveGitCommonDir(repoRoot, runner);
  const worktreeAbsolute = path.join(commonDir, ...manifest.isolation.rootName.split("/"), runId);
  if (fs.existsSync(worktreeAbsolute)) throw new Error(`Cursor worktree already exists for run ${runId}.`);
  fs.mkdirSync(path.dirname(worktreeAbsolute), { recursive: true });
  const added = runner("git", ["worktree", "add", "--detach", worktreeAbsolute, baseHead], { cwd: repoRoot, timeoutMs: 30000 });
  if (added.exitCode !== 0) throw new Error(`git worktree add failed: ${String(added.stderr || added.stdout).trim()}`);
  return { absolute: worktreeAbsolute, reference: `git-common-dir:${manifest.isolation.rootName}/${runId}` };
}

export function cursorCliArgs(repoRoot, role, prompt) {
  const manifest = loadCursorManifest(repoRoot);
  if (!Object.hasOwn(manifest.roles, role)) throw new Error(`Unsupported Cursor CLI role: ${role}`);
  const args = ["-p"];
  if (manifest.nonInteractive.forceByRole[role] === true) args.push("--force");
  args.push("--output-format", manifest.nonInteractive.outputFormat, prompt);
  return args;
}

export function roleCursorConfig(repoRoot, role) {
  const manifest = loadCursorManifest(repoRoot);
  if (!Object.hasOwn(manifest.roles, role)) throw new Error(`Unsupported Cursor CLI role: ${role}`);
  return cursorPermissionsForRole(loadCommandGuardrails(repoRoot), role === "implementer" ? "implementer" : "read-only");
}

export function parseChangedFiles(statusText) {
  const files = [];
  for (const line of String(statusText).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value = line.slice(3).trim();
    if (value.includes(" -> ")) value = value.split(" -> ").at(-1);
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    files.push(value.replaceAll("\\", "/"));
  }
  return [...new Set(files)].sort();
}
