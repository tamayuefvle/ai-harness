import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const defaultRepoRoot = path.resolve(here, "../..");
const schemaVersion = "1.1.0";

export function loadGitHubConfig(repoRoot = defaultRepoRoot) {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, "harness/integrations/github.json"), "utf8"),
  );
}
export function defaultRunner(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  return {
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    durationMs: Date.now() - started,
  };
}

function parseJson(result, allowedExitCodes = [0]) {
  if (!allowedExitCodes.includes(result.exitCode)) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function trimText(value, maxLength = 200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}


function safeTaskId(value) {
  const taskId = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(taskId)) {
    throw new Error(`Invalid task id: ${taskId || "<empty>"}`);
  }
  return taskId;
}

function resolveWithinRepo(repoRoot, candidate) {
  const target = path.resolve(repoRoot, candidate);
  const relative = path.relative(repoRoot, target);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return target;
  throw new Error(`Output path must stay inside the repository: ${candidate}`);
}

function activeTask(repoRoot) {
  try {
    const text = fs.readFileSync(path.join(repoRoot, "docs/specs/_active.md"), "utf8");
    const task = text.match(/active_spec:\s*(\S+)/)?.[1];
    if (task && task !== "none") return task;
  } catch {}
  return process.env.GITHUB_CONTEXT_TASK || "unscoped";
}

function addCommand(report, id, command, args, result) {
  report.source.commands.push({
    id,
    command,
    args,
    exitCode: result.exitCode,
    durationMs: Math.max(0, result.durationMs ?? 0),
  });
}

function runRecorded(report, runner, config, id, command, args, repoRoot) {
  const result = runner(command, args, {
    cwd: repoRoot,
    timeoutMs: config.standard.commandTimeoutMs,
  });
  addCommand(report, id, command, args, result);
  return result;
}

export function collectGitHubContext(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const config = options.config ?? loadGitHubConfig(repoRoot);
  const runner = options.runner ?? defaultRunner;
  const includeUntrusted = options.includeUntrusted ?? config.standard.includeUntrustedTextByDefault;
  const now = options.now ?? (() => new Date());
  const report = {
    schemaVersion,
    generatedAt: now().toISOString(),
    taskId: safeTaskId(options.taskId ?? activeTask(repoRoot)),
    status: "complete",
    reasonCode: null,
    source: {
      provider: "gh-cli",
      repoRoot: ".",
      branch: null,
      headSha: null,
      commands: [],
    },
    repository: null,
    pullRequest: null,
    requiredChecks: [],
    recentRuns: [],
    untrustedContentIncluded: Boolean(includeUntrusted),
    warnings: [],
    errors: [],
  };

  const branchResult = runRecorded(report, runner, config, "git-branch", "git", ["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  if (branchResult.exitCode === 0) report.source.branch = trimText(branchResult.stdout, 200);
  else report.warnings.push("Current Git branch could not be resolved.");

  const shaResult = runRecorded(report, runner, config, "git-head", "git", ["rev-parse", "HEAD"], repoRoot);
  if (shaResult.exitCode === 0) report.source.headSha = trimText(shaResult.stdout, 80);
  else report.warnings.push("Current Git commit could not be resolved.");

  const originResult = runRecorded(report, runner, config, "git-origin", "git", ["remote", "get-url", "origin"], repoRoot);
  if (originResult.exitCode !== 0 || !trimText(originResult.stdout, 500)) {
    report.status = "unavailable";
    report.reasonCode = "origin_missing";
    report.errors.push("GitHub repository context is unavailable because the origin remote is missing. Add the intended HTTPS GitHub origin before relying on GitHub context.");
    return report;
  }
  const originUrl = trimText(originResult.stdout, 500);
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?$/i.test(originUrl)) {
    report.status = "unavailable";
    report.reasonCode = "origin_not_https";
    report.errors.push("GitHub repository context requires an HTTPS github.com origin. Align the remote with the harness gh-cli-https contract; do not fall back to SSH unless the contract is explicitly changed.");
    return report;
  }

  const ghVersion = runRecorded(report, runner, config, "gh-version", "gh", ["--version"], repoRoot);
  if (ghVersion.exitCode !== 0) {
    report.status = "unavailable";
    report.reasonCode = "gh_cli_missing";
    report.errors.push("GitHub repository context requires GitHub CLI (`gh`) on PATH.");
    return report;
  }

  const authResult = runRecorded(report, runner, config, "gh-auth", "gh", ["auth", "status", "--active", "--hostname", "github.com"], repoRoot);
  if (authResult.exitCode !== 0) {
    report.status = "unavailable";
    report.reasonCode = "authentication_unavailable";
    report.errors.push("GitHub CLI authentication for github.com is unavailable. Run `gh auth status` and repair authentication without exposing tokens.");
    return report;
  }

  const repoResult = runRecorded(report, runner, config, "gh-repository", "gh", [
    "repo", "view", "--json", "nameWithOwner,defaultBranchRef,isPrivate,url",
  ], repoRoot);
  const repoJson = parseJson(repoResult);
  if (!repoJson || !repoJson.nameWithOwner) {
    report.status = "unavailable";
    report.reasonCode = "repository_unreachable";
    report.errors.push("GitHub CLI is authenticated and origin is configured, but the repository could not be resolved. Verify repository existence/access and that origin points at the intended repository.");
    return report;
  }
  report.repository = {
    nameWithOwner: repoJson.nameWithOwner,
    defaultBranch: repoJson.defaultBranchRef?.name ?? null,
    isPrivate: Boolean(repoJson.isPrivate),
    url: repoJson.url,
  };

  const prArgs = [
    "pr", "view",
    ...(options.pullRequest ? [String(options.pullRequest)] : []),
    "--json",
    "number,title,state,isDraft,mergeable,mergeStateStatus,reviewDecision,headRefName,baseRefName,headRefOid,baseRefOid,updatedAt,url",
  ];
  const prResult = runRecorded(report, runner, config, "gh-pull-request", "gh", prArgs, repoRoot);
  const prJson = parseJson(prResult);
  if (prJson?.number) {
    report.pullRequest = {
      number: prJson.number,
      state: prJson.state,
      isDraft: Boolean(prJson.isDraft),
      mergeable: prJson.mergeable,
      mergeStateStatus: prJson.mergeStateStatus,
      reviewDecision: prJson.reviewDecision ?? null,
      headRefName: prJson.headRefName,
      baseRefName: prJson.baseRefName,
      headRefOid: prJson.headRefOid,
      baseRefOid: prJson.baseRefOid,
      updatedAt: prJson.updatedAt,
      url: prJson.url,
      ...(includeUntrusted ? { title: trimText(prJson.title, 200) } : {}),
    };

    const checksResult = runRecorded(report, runner, config, "gh-required-checks", "gh", [
      "pr", "checks", String(prJson.number), "--required", "--json",
      "bucket,name,state,workflow,link,startedAt,completedAt",
    ], repoRoot);
    const checksJson = parseJson(checksResult, [0, 8]);
    if (Array.isArray(checksJson)) {
      report.requiredChecks = checksJson.map((item) => ({
        name: item.name,
        bucket: item.bucket,
        state: item.state,
        workflow: item.workflow ?? null,
        link: item.link ?? null,
        startedAt: item.startedAt ?? null,
        completedAt: item.completedAt ?? null,
      }));
    } else {
      report.status = "degraded";
      report.warnings.push("Required pull-request checks could not be collected.");
    }
  } else {
    report.warnings.push("No pull request is associated with the current branch.");
  }

  const branch = report.pullRequest?.headRefName ?? report.source.branch;
  if (branch && branch !== "HEAD") {
    const runsResult = runRecorded(report, runner, config, "gh-recent-runs", "gh", [
      "run", "list", "--branch", branch, "--limit", String(config.standard.recentRunLimit), "--json",
      "databaseId,workflowName,displayTitle,event,status,conclusion,headBranch,headSha,createdAt,updatedAt,url",
    ], repoRoot);
    const runsJson = parseJson(runsResult);
    if (Array.isArray(runsJson)) {
      report.recentRuns = runsJson.map((item) => ({
        databaseId: item.databaseId,
        workflowName: item.workflowName ?? null,
        displayTitle: includeUntrusted ? trimText(item.displayTitle, 200) : null,
        event: item.event,
        status: item.status,
        conclusion: item.conclusion ?? null,
        headBranch: item.headBranch ?? null,
        headSha: item.headSha,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        url: item.url,
      }));
    } else {
      report.status = report.status === "unavailable" ? "unavailable" : "degraded";
      report.warnings.push("Recent GitHub Actions runs could not be collected.");
    }
  }

  if (!report.source.branch || !report.source.headSha) {
    report.status = report.status === "unavailable" ? "unavailable" : "degraded";
  }
  return report;
}

export function evaluateContext(report, options = {}) {
  const failures = [];
  if (options.requireComplete && report.status !== "complete") {
    failures.push(`GitHub context status is ${report.status}, not complete.`);
  }
  if (options.requireChecksPass) {
    if (!report.pullRequest) failures.push("A pull request is required for check verification.");
    if (report.requiredChecks.length === 0) failures.push("No required checks were returned.");
    const blocked = report.requiredChecks.filter((check) => check.bucket !== "pass" && check.bucket !== "skipping");
    if (blocked.length > 0) failures.push(`Required checks are not passing: ${blocked.map((item) => item.name).join(", ")}`);
  }
  return failures;
}

export function parseArgs(argv) {
  const options = { includeUntrusted: false, requireComplete: false, requireChecksPass: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") options.output = argv[++index];
    else if (arg === "--task") options.taskId = argv[++index];
    else if (arg === "--pr") {
      const value = argv[++index];
      if (!/^[1-9][0-9]*$/.test(value ?? "")) throw new Error("--pr must be a positive pull-request number.");
      options.pullRequest = value;
    }
    else if (arg === "--include-untrusted") options.includeUntrusted = true;
    else if (arg === "--require-complete") options.requireComplete = true;
    else if (arg === "--require-checks-pass") options.requireChecksPass = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function reportPath(repoRoot, config, taskId, explicitPath) {
  if (explicitPath) return resolveWithinRepo(repoRoot, explicitPath);
  return resolveWithinRepo(repoRoot, config.standard.reportPathTemplate.replace("{task}", safeTaskId(taskId)));
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const config = loadGitHubConfig(defaultRepoRoot);
  const report = collectGitHubContext({ ...cli, config, repoRoot: defaultRepoRoot });
  const target = reportPath(defaultRepoRoot, config, report.taskId, cli.output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`GitHub context: ${path.relative(defaultRepoRoot, target)} (${report.status})`);
  for (const warning of report.warnings) console.warn(`WARN: ${warning}`);
  for (const error of report.errors) console.error(`ERROR: ${error}`);
  const failures = evaluateContext(report, cli);
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = failures.length > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
