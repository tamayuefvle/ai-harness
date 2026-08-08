import test from "node:test";
import assert from "node:assert/strict";
import { collectGitHubContext, evaluateContext, parseArgs, reportPath } from "./context.mjs";
import { collectGitHubDoctor } from "./doctor.mjs";

const config = {
  standard: { includeUntrustedTextByDefault: false, recentRunLimit: 10, commandTimeoutMs: 1000 },
};

function fixtureRunner(overrides = {}) {
  const base = {
    "git rev-parse --abbrev-ref HEAD": { exitCode: 0, stdout: "feature/PF-002\n", durationMs: 1 },
    "git rev-parse HEAD": { exitCode: 0, stdout: "abc123\n", durationMs: 1 },
    "git remote get-url origin": { exitCode: 0, stdout: "https://github.com/owner/repo.git\n", durationMs: 1 },
    "gh --version": { exitCode: 0, stdout: "gh version 2\n", durationMs: 1 },
    "gh auth status --active --hostname github.com": { exitCode: 0, stdout: "ok\n", durationMs: 1 },
    "gh repo view --json nameWithOwner,defaultBranchRef,isPrivate,url": { exitCode: 0, stdout: JSON.stringify({ nameWithOwner: "owner/repo", defaultBranchRef: { name: "main" }, isPrivate: true, url: "https://github.com/owner/repo" }), durationMs: 2 },
    "gh pr view --json number,title,state,isDraft,mergeable,mergeStateStatus,reviewDecision,headRefName,baseRefName,headRefOid,baseRefOid,updatedAt,url": { exitCode: 0, stdout: JSON.stringify({ number: 12, title: "untrusted title", state: "OPEN", isDraft: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: "APPROVED", headRefName: "feature/PF-002", baseRefName: "main", headRefOid: "abc123", baseRefOid: "def456", updatedAt: "2026-07-28T00:00:00Z", url: "https://github.com/owner/repo/pull/12" }), durationMs: 2 },
    "gh pr checks 12 --required --json bucket,name,state,workflow,link,startedAt,completedAt": { exitCode: 0, stdout: JSON.stringify([{ bucket: "pass", name: "quality", state: "SUCCESS", workflow: "Quality Gate", link: "https://example/check", startedAt: null, completedAt: "2026-07-28T00:00:00Z" }]), durationMs: 2 },
    "gh run list --branch feature/PF-002 --limit 10 --json databaseId,workflowName,displayTitle,event,status,conclusion,headBranch,headSha,createdAt,updatedAt,url": { exitCode: 0, stdout: JSON.stringify([{ databaseId: 99, workflowName: "Quality Gate", displayTitle: "CI title", event: "pull_request", status: "completed", conclusion: "success", headBranch: "feature/PF-002", headSha: "abc123", createdAt: "2026-07-28T00:00:00Z", updatedAt: "2026-07-28T00:01:00Z", url: "https://example/run" }]), durationMs: 2 },
    "git --version": { exitCode: 0, stdout: "git version 2", durationMs: 1 },
    "gh repo view --json nameWithOwner,url": { exitCode: 0, stdout: "{}", durationMs: 1 },
  };
  const data = { ...base, ...overrides };
  return (command, args) => data[`${command} ${args.join(" ")}`] ?? { exitCode: 1, stdout: "", stderr: "unexpected", durationMs: 1 };
}

const fixed = () => new Date("2026-07-28T01:02:03.000Z");

test("collects normalized repository, PR, checks, and Actions context", () => {
  const report = collectGitHubContext({ repoRoot: "/repo", runner: fixtureRunner(), config, taskId: "PF-002", now: fixed });
  assert.equal(report.status, "complete");
  assert.equal(report.repository.nameWithOwner, "owner/repo");
  assert.equal(report.pullRequest.number, 12);
  assert.equal(report.pullRequest.title, undefined);
  assert.equal(report.requiredChecks[0].bucket, "pass");
  assert.equal(report.recentRuns[0].databaseId, 99);
  assert.equal(evaluateContext(report, { requireComplete: true, requireChecksPass: true }).length, 0);
});
test("includes bounded untrusted PR title only with explicit opt-in", () => {
  const report = collectGitHubContext({ repoRoot: "/repo", runner: fixtureRunner(), config, includeUntrusted: true, taskId: "PF-002", now: fixed });
  assert.equal(report.untrustedContentIncluded, true);
  assert.equal(report.pullRequest.title, "untrusted title");
});

test("records unavailable state without leaking command stderr", () => {
  const report = collectGitHubContext({ repoRoot: "/repo", runner: fixtureRunner({
    "gh repo view --json nameWithOwner,defaultBranchRef,isPrivate,url": { exitCode: 1, stdout: "", stderr: "token=secret", durationMs: 2 },
  }), config, taskId: "PF-002", now: fixed });
  assert.equal(report.status, "unavailable");
  assert.equal(report.reasonCode, "repository_unreachable");
  assert.equal(JSON.stringify(report).includes("secret"), false);
});

test("treats a branch without a PR as complete context but check verification fails", () => {
  const report = collectGitHubContext({ repoRoot: "/repo", runner: fixtureRunner({
    "gh pr view --json number,title,state,isDraft,mergeable,mergeStateStatus,reviewDecision,headRefName,baseRefName,headRefOid,baseRefOid,updatedAt,url": { exitCode: 1, stdout: "", durationMs: 2 },
  }), config, taskId: "PF-002", now: fixed });
  assert.equal(report.status, "complete");
  assert.equal(report.pullRequest, null);
  assert.ok(evaluateContext(report, { requireChecksPass: true }).length >= 1);
});

test("fails closed when a required check is pending or failed", () => {
  const report = collectGitHubContext({ repoRoot: "/repo", runner: fixtureRunner({
    "gh pr checks 12 --required --json bucket,name,state,workflow,link,startedAt,completedAt": { exitCode: 8, stdout: JSON.stringify([{ bucket: "pending", name: "quality", state: "PENDING", workflow: null, link: null, startedAt: null, completedAt: null }]), durationMs: 1 },
  }), config, taskId: "PF-002", now: fixed });
  assert.match(evaluateContext(report, { requireChecksPass: true }).join("\n"), /quality/);
});

test("uses only fixed read-only gh subcommands", () => {
  const report = collectGitHubContext({ repoRoot: "/repo", runner: fixtureRunner(), config, taskId: "PF-002", now: fixed });
  const ghCommands = report.source.commands.filter((item) => item.command === "gh").map((item) => item.args.join(" "));
  assert.deepEqual(ghCommands.map((item) => item.split(" ").slice(0, 2).join(" ")), ["--version", "auth status", "repo view", "pr view", "pr checks", "run list"]);
  const mutatingVerbs = new Set(["create", "delete", "edit", "merge", "close", "reopen"]);
  assert.equal(report.source.commands.filter((item) => item.command === "gh").some((item) => mutatingVerbs.has(item.args[1]) || mutatingVerbs.has(item.args[0])), false);
});

test("doctor checks gh auth without requesting token display", () => {
  const calls = [];
  const runner = (command, args) => { calls.push([command, ...args]); return fixtureRunner()(command, args); };
  const report = collectGitHubDoctor({ repoRoot: "/repo", runner, config });
  assert.equal(report.checks.some((item) => item.status === "fail"), false);
  assert.equal(calls.flat().includes("--show-token"), false);
});

test("rejects unsafe task IDs, output traversal, and non-numeric PR selectors", () => {
  assert.throws(() => collectGitHubContext({ repoRoot: "/repo", runner: fixtureRunner(), config, taskId: "../escape", now: fixed }), /Invalid task id/);
  assert.throws(() => reportPath("/repo", { standard: { reportPathTemplate: ".harness/reports/{task}/github-context.json" } }, "PF-002", "../escape.json"), /inside the repository/);
  assert.throws(() => parseArgs(["--pr", "https://example/token@github.com/pr/1"]), /positive pull-request number/);
});


test("reports origin_missing without misdiagnosing authentication", () => {
  const report = collectGitHubContext({ repoRoot: "/repo", runner: fixtureRunner({
    "git remote get-url origin": { exitCode: 2, stdout: "", stderr: "No such remote", durationMs: 1 },
  }), config, taskId: "PF-002", now: fixed });
  assert.equal(report.status, "unavailable");
  assert.equal(report.reasonCode, "origin_missing");
  assert.match(report.errors.join("\n"), /origin remote is missing/i);
});

test("reports origin_not_https before attempting GitHub authentication", () => {
  const calls = [];
  const base = fixtureRunner({ "git remote get-url origin": { exitCode: 0, stdout: "git@github.com:owner/repo.git\n", durationMs: 1 } });
  const report = collectGitHubContext({ repoRoot: "/repo", runner: (command, args) => { calls.push(`${command} ${args.join(" ")}`); return base(command,args); }, config, taskId: "PF-002", now: fixed });
  assert.equal(report.reasonCode, "origin_not_https");
  assert.equal(calls.some((item) => item.startsWith("gh auth status")), false);
});

test("reports authentication_unavailable separately from repository errors", () => {
  const report = collectGitHubContext({ repoRoot: "/repo", runner: fixtureRunner({
    "gh auth status --active --hostname github.com": { exitCode: 1, stdout: "", stderr: "expired", durationMs: 1 },
  }), config, taskId: "PF-002", now: fixed });
  assert.equal(report.reasonCode, "authentication_unavailable");
  assert.equal(JSON.stringify(report).includes("expired"), false);
});


test("doctor distinguishes a missing origin from authentication failure", () => {
  const report = collectGitHubDoctor({ repoRoot: "/repo", runner: fixtureRunner({
    "git remote get-url origin": { exitCode: 2, stdout: "", stderr: "missing", durationMs: 1 },
  }), config });
  const origin = report.checks.find((item) => item.name === "Origin remote");
  assert.equal(origin.status, "fail");
  assert.equal(origin.reasonCode, "origin_missing");
  assert.equal(report.checks.find((item) => item.name === "GitHub authentication").status, "pass");
  assert.equal(report.checks.find((item) => item.name === "GitHub repository").status, "skip");
});
