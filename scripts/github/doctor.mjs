import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultRepoRoot, defaultRunner, loadGitHubConfig } from "./context.mjs";

export function collectGitHubDoctor(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const runner = options.runner ?? defaultRunner;
  const config = options.config ?? loadGitHubConfig(repoRoot);
  const checks = [];
  const exec = (name, command, args, failure, status = "fail", reasonCode = null) => {
    const result = runner(command, args, { cwd: repoRoot, timeoutMs: config.standard.commandTimeoutMs });
    checks.push({
      name,
      status: result.exitCode === 0 ? "pass" : status,
      reasonCode: result.exitCode === 0 ? null : reasonCode,
      detail: result.exitCode === 0 ? (result.stdout?.trim().split("\n")[0] || "available") : failure,
    });
    return result;
  };

  exec("Git", "git", ["--version"], "Git is not available on PATH.", "fail", "git_missing");
  const remote = exec("Origin remote", "git", ["remote", "get-url", "origin"], "origin remote is missing.", "fail", "origin_missing");
  let remoteReady = false;
  if (remote.exitCode === 0) {
    const url = remote.stdout.trim();
    remoteReady = /^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?$/i.test(url);
    checks.push({
      name: "HTTPS remote",
      status: remoteReady ? "pass" : "fail",
      reasonCode: remoteReady ? null : "origin_not_https",
      detail: remoteReady ? url : "Use the intended https://github.com/<owner>/<repo>.git origin. Do not silently fall back to SSH.",
    });
  }

  const gh = exec("GitHub CLI", "gh", ["--version"], "Install GitHub CLI and rerun this command.", "fail", "gh_cli_missing");
  let authReady = false;
  if (gh.exitCode === 0) {
    const auth = exec("GitHub authentication", "gh", ["auth", "status", "--active", "--hostname", "github.com"], "Run `gh auth login --hostname github.com --git-protocol https --web`.", "fail", "authentication_unavailable");
    authReady = auth.exitCode === 0;
    if (remoteReady && authReady) {
      exec("GitHub repository", "gh", ["repo", "view", "--json", "nameWithOwner,url"], "The authenticated GitHub CLI could not resolve the configured origin repository.", "fail", "repository_unreachable");
    } else {
      checks.push({ name: "GitHub repository", status: "skip", reasonCode: null, detail: "Repository lookup skipped until HTTPS origin and authentication pass." });
    }
  } else {
    checks.push({ name: "GitHub authentication", status: "skip", reasonCode: null, detail: "GitHub CLI unavailable." });
    checks.push({ name: "GitHub repository", status: "skip", reasonCode: null, detail: "GitHub CLI unavailable." });
  }

  const helper = exec("Credential helper", "git", ["config", "--get-all", "credential.helper"], "Run `gh auth setup-git --hostname github.com`.", "warn", "credential_helper_unavailable");
  if (helper.exitCode === 0 && !/gh auth git-credential|!gh auth git-credential/.test(helper.stdout)) {
    checks.push({ name: "GitHub CLI credential helper", status: "warn", reasonCode: "credential_helper_not_gh", detail: "Credential helper is configured but does not visibly delegate to gh; verify `gh auth setup-git`." });
  }

  const branch = exec("Current branch", "git", ["branch", "--show-current"], "Detached HEAD or branch unavailable.", "warn", "branch_unavailable");
  if (branch.exitCode === 0 && config.writePolicy.protectedBranches.includes(branch.stdout.trim())) {
    checks.push({ name: "Protected branch", status: "warn", reasonCode: "protected_branch_checked_out", detail: `Current branch ${branch.stdout.trim()} must not be pushed directly.` });
  }
  return { schemaVersion: "2.1.0", checks };
}

function main() {
  const report = collectGitHubDoctor();
  console.log("GitHub CLI + HTTPS doctor\n");
  for (const item of report.checks) console.log(`[${item.status.toUpperCase()}] ${item.name}: ${item.detail}`);
  process.exitCode = report.checks.some((item) => item.status === "fail") ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
