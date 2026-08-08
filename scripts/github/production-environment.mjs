import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultRepoRoot, defaultRunner, loadGitHubConfig } from "./context.mjs";

function parseJson(result) {
  if (result.exitCode !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

export function evaluateProductionEnvironment(environment, config, branchProtection = {}) {
  const contract = config.productionEnvironment;
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });
  if (!environment) {
    add("production Environment", "fail", `GitHub Environment '${contract.name}' could not be read.`);
    return checks;
  }
  add("production Environment", environment.name === contract.name ? "pass" : "fail", environment.name ?? "missing name");
  const reviewerRule = (environment.protection_rules ?? []).find((rule) => rule.type === "required_reviewers");
  const reviewerCount = reviewerRule?.reviewers?.length ?? 0;
  add("Required reviewers", reviewerCount >= contract.requiredReviewers.minimum ? "pass" : "fail", `${reviewerCount} configured; minimum ${contract.requiredReviewers.minimum}.`);
  add("Prevent self-review", reviewerRule?.prevent_self_review === true ? "pass" : "fail", reviewerRule?.prevent_self_review === true ? "enabled" : "must be enabled");
  add("Deployment branch policy", environment.deployment_branch_policy?.protected_branches === true ? "pass" : "fail", environment.deployment_branch_policy?.protected_branches === true ? "protected branches only" : "must use protected branches only");
  for (const branch of contract.requiredProtectedBranches) {
    const protectedResult = branchProtection[branch];
    add(`Protected branch ${branch}`, protectedResult === true ? "pass" : "fail", protectedResult === true ? "branch protection API is accessible" : "branch protection is missing or inaccessible");
  }
  add("Administrator bypass", "manual", contract.allowAdminBypass ? "Contract allows bypass." : "Verify in GitHub UI that administrators cannot bypass Environment protection rules; the environment GET response does not expose this setting.");
  return checks;
}

export function collectProductionEnvironmentDoctor(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const config = options.config ?? loadGitHubConfig(repoRoot);
  const runner = options.runner ?? defaultRunner;
  const timeoutMs = config.standard.commandTimeoutMs;
  const repoResult = runner("gh", ["repo", "view", "--json", "nameWithOwner,isPrivate"], { cwd: repoRoot, timeoutMs });
  const repo = parseJson(repoResult);
  if (!repo?.nameWithOwner) return { schemaVersion: "1.0.0", repository: null, checks: [{ name: "GitHub repository", status: "fail", detail: "Run `gh auth login` and verify the repository remote." }] };
  const [owner, name] = repo.nameWithOwner.split("/");
  const envResult = runner("gh", ["api", `repos/${owner}/${name}/environments/${config.productionEnvironment.name}`], { cwd: repoRoot, timeoutMs });
  const environment = parseJson(envResult);
  const branchProtection = {};
  for (const branch of config.productionEnvironment.requiredProtectedBranches) {
    const encoded = encodeURIComponent(branch);
    const classic = runner("gh", ["api", `repos/${owner}/${name}/branches/${encoded}/protection`], { cwd: repoRoot, timeoutMs });
    if (classic.exitCode === 0) {
      branchProtection[branch] = true;
      continue;
    }
    const rules = runner("gh", ["api", `repos/${owner}/${name}/rules/branches/${encoded}`], { cwd: repoRoot, timeoutMs });
    const rulesJson = parseJson(rules);
    branchProtection[branch] = Array.isArray(rulesJson) && rulesJson.length > 0;
  }
  return {
    schemaVersion: "1.0.0",
    repository: { nameWithOwner: repo.nameWithOwner, isPrivate: Boolean(repo.isPrivate) },
    checks: evaluateProductionEnvironment(environment, config, branchProtection),
  };
}

function main() {
  const report = collectProductionEnvironmentDoctor();
  console.log("GitHub production Environment doctor\n");
  if (report.repository) console.log(`Repository: ${report.repository.nameWithOwner}${report.repository.isPrivate ? " (private)" : " (public)"}\n`);
  for (const item of report.checks) console.log(`[${item.status.toUpperCase()}] ${item.name}: ${item.detail}`);
  process.exitCode = report.checks.some((item) => item.status === "fail") ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

