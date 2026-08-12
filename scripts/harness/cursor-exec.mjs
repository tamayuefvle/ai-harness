import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAgainstSchema, schemaFor } from "./artifact-validator.mjs";
import {
  collectCursorPreflight,
  createCursorWorktree,
  cursorCliArgs,
  defaultRunner,
  loadCursorManifest,
  parseChangedFiles,
  roleCursorConfig,
} from "./cursor-lib.mjs";
import { normalizeRepoRelative } from "./command-policy.mjs";
import { utcTimestamp } from "./time.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function parseCursorExecArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    out[key] = value;
  }
  return out;
}

export function safeRunId(value) {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(value ?? "")) throw new Error("--run-id must match ^[A-Za-z0-9._-]{1,80}$");
  return value;
}

function runOrThrow(runner, command, args, options = {}) {
  const result = runner(command, args, options);
  if (result.exitCode !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${String(result.stderr || result.stdout).trim()}`);
  return result;
}

function writeRaw(reportDir, execution) {
  fs.writeFileSync(path.join(reportDir, "raw.json"), String(execution?.stdout || execution?.stderr || ""), "utf8");
}

/**
 * Execute a bounded Cursor CLI run against an isolated linked worktree.
 * Injectable `runner` / `preflight` support fixture regression without a live provider.
 */
export function runCursorExec(repoRoot, options, deps = {}) {
  const runner = deps.runner ?? defaultRunner;
  const role = options.role;
  const runId = safeRunId(options.runId);
  const promptRef = normalizeRepoRelative(repoRoot, options.promptFile, "prompt file");
  const manifest = loadCursorManifest(repoRoot);
  if (!Object.hasOwn(manifest.roles, role)) throw new Error(`Unsupported --role: ${role}`);

  const stat = fs.statSync(promptRef.absolute);
  if (!stat.isFile() || stat.size > manifest.nonInteractive.maxPromptBytes) {
    throw new Error(`Prompt file must be <= ${manifest.nonInteractive.maxPromptBytes} bytes.`);
  }
  const prompt = fs.readFileSync(promptRef.absolute, "utf8");

  const preflight = deps.preflight ?? collectCursorPreflight(repoRoot, { runner });
  if (preflight.status !== "pass") throw new Error(`Cursor preflight failed: ${preflight.reasonCode}`);

  const startedAt = utcTimestamp();
  const baseHead = runOrThrow(runner, "git", ["rev-parse", "HEAD"], { cwd: repoRoot, timeoutMs: 5000 }).stdout.trim();
  const worktree = createCursorWorktree(repoRoot, runId, baseHead, runner);
  const worktreeAbsolute = worktree.absolute;
  const worktreeRelative = worktree.reference;
  const reportDir = path.join(repoRoot, ".harness/reports/cursor", runId);
  fs.mkdirSync(reportDir, { recursive: true });
  const rawRef = `.harness/reports/cursor/${runId}/raw.json`;
  const resultRef = `.harness/reports/cursor/${runId}/result.json`;

  let execution = { exitCode: 1, stdout: "", stderr: "Cursor execution did not start." };
  let failureReason = null;
  let changedFiles = [];
  let preserved = true;
  const projectConfigAbsolute = path.join(worktreeAbsolute, manifest.projectConfig);

  try {
    const roleConfig = roleCursorConfig(repoRoot, role);
    fs.writeFileSync(projectConfigAbsolute, `${JSON.stringify(roleConfig, null, 2)}\n`);
    const env = { ...process.env, HARNESS_CURSOR_ROLE: role, HARNESS_REPO_ROOT: worktreeAbsolute };
    execution = runner(preflight.binary, cursorCliArgs(repoRoot, role, prompt), {
      cwd: worktreeAbsolute,
      env,
      timeoutMs: manifest.nonInteractive.timeoutSeconds * 1000,
    });
    if (execution.exitCode !== 0) {
      failureReason = `Cursor CLI exited with code ${execution.exitCode}: ${String(execution.stderr || execution.stdout).trim()}`;
    }
  } catch (error) {
    failureReason = error.message;
    execution = { exitCode: 1, stdout: execution.stdout ?? "", stderr: error.message };
  } finally {
    writeRaw(reportDir, execution);
    const restore = runner("git", ["restore", "--source=HEAD", "--", manifest.projectConfig], {
      cwd: worktreeAbsolute,
      timeoutMs: 5000,
    });
    if (restore.exitCode !== 0) {
      failureReason ??= `Could not restore generated Cursor project config: ${String(restore.stderr || restore.stdout).trim()}`;
    }
    const statusResult = runner("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: worktreeAbsolute,
      timeoutMs: 5000,
    });
    if (statusResult.exitCode === 0) changedFiles = parseChangedFiles(statusResult.stdout);
    else failureReason ??= `Could not inspect Cursor worktree status: ${String(statusResult.stderr || statusResult.stdout).trim()}`;
  }

  if (role !== "implementer" && changedFiles.length) {
    failureReason = "Read-only Cursor worker changed files despite role restrictions.";
  }

  let status = execution.exitCode === 0 && !failureReason ? "passed" : "failed";
  if (role !== "implementer" && changedFiles.length) status = "blocked";

  if (role !== "implementer" && changedFiles.length === 0) {
    const removed = runner("git", ["worktree", "remove", worktreeAbsolute], { cwd: repoRoot, timeoutMs: 30000 });
    if (removed.exitCode === 0) preserved = false;
    else failureReason ??= `Could not remove clean read-only worktree: ${String(removed.stderr || removed.stdout).trim()}`;
  }

  const result = {
    schemaVersion: "1.0.0",
    runId,
    logicalExecutor: "cursor",
    transport: "cursor-cli",
    role,
    status,
    exitCode: execution.exitCode ?? null,
    baseHead,
    worktree: { path: worktreeRelative, preserved, autoApplied: false },
    rawOutputRef: rawRef,
    changedFiles,
    startedAt,
    finishedAt: utcTimestamp(),
    failureReason,
  };
  validateAgainstSchema(result, schemaFor("cursorAgentResult"), "Cursor agent result");
  fs.writeFileSync(path.join(reportDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  return { ...result, resultRef };
}

function main() {
  const opts = parseCursorExecArgs(process.argv.slice(2));
  try {
    const result = runCursorExec(packageRoot, {
      role: opts.role,
      runId: opts["run-id"],
      promptFile: opts["prompt-file"],
    });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === "passed" ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
