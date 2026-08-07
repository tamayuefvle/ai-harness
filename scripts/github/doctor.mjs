import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultRepoRoot, defaultRunner, loadGitHubConfig } from "./context.mjs";

export function collectGitHubDoctor(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const runner = options.runner ?? defaultRunner;
  const config = options.config ?? loadGitHubConfig(repoRoot);
  const checks = [];
  const exec = (name, command, args, failure, status = "fail") => {
    const result = runner(command, args, { cwd: repoRoot, timeoutMs: config.standard.commandTimeoutMs });
    checks.push({
      name,
      status: result.exitCode === 0 ? "pass" : status,
      detail: result.exitCode === 0 ? (result.stdout?.trim().split("\n")[0] || "available") : failure,
    });
    return result;
  };

  exec("Git", "git", ["--version"], "Git is not available on PATH.");
  const gh = exec("GitHub CLI", "gh", ["--version"], "Install GitHub CLI and rerun this command.");
  if (gh.exitCode === 0) {
    exec("GitHub authentication", "gh", ["auth", "status", "--active", "--hostname", "github.com"], "Run `gh auth login --hostname github.com --git-protocol https --web`.");
    exec("GitHub repository", "gh", ["repo", "view", "--json", "nameWithOwner,url"], "The current remote is not accessible through GitHub CLI.");
  } else {
    checks.push({ name: "GitHub authentication", status: "skip", detail: "GitHub CLI unavailable." });
    checks.push({ name: "GitHub repository", status: "skip", detail: "GitHub CLI unavailable." });
  }

  const remote = exec("Origin remote", "git", ["remote", "get-url", "origin"], "origin remote is missing.", "warn");
  if (remote.exitCode === 0) {
    const url = remote.stdout.trim();
    checks.push({
      name: "HTTPS remote",
      status: /^https:\/\/github\.com\//.test(url) ? "pass" : "fail",
      detail: /^https:\/\/github\.com\//.test(url) ? url : "Run `git remote set-url origin https://github.com/<owner>/<repo>.git`.",
    });
  }

  const helper = exec("Credential helper", "git", ["config", "--get-all", "credential.helper"], "Run `gh auth setup-git --hostname github.com`.", "warn");
  if (helper.exitCode === 0 && !/gh auth git-credential|!gh auth git-credential/.test(helper.stdout)) {
    checks.push({ name: "GitHub CLI credential helper", status: "warn", detail: "Credential helper is configured but does not visibly delegate to gh; verify `gh auth setup-git`." });
  }

  const branch = exec("Current branch", "git", ["branch", "--show-current"], "Detached HEAD or branch unavailable.", "warn");
  if (branch.exitCode === 0 && config.writePolicy.protectedBranches.includes(branch.stdout.trim())) {
    checks.push({ name: "Protected branch", status: "warn", detail: `Current branch ${branch.stdout.trim()} must not be pushed directly.` });
  }
  return { schemaVersion: "2.0.0", checks };
}

function main() {
  const report = collectGitHubDoctor();
  console.log("GitHub CLI + HTTPS doctor\n");
  for (const item of report.checks) console.log(`[${item.status.toUpperCase()}] ${item.name}: ${item.detail}`);
  process.exitCode = report.checks.some((item) => item.status === "fail") ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
