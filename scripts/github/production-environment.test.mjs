import test from "node:test";
import assert from "node:assert/strict";
import { collectProductionEnvironmentDoctor, evaluateProductionEnvironment } from "./production-environment.mjs";

const config = {
  standard: { commandTimeoutMs: 1000 },
  productionEnvironment: {
    name: "production",
    requiredReviewers: { minimum: 1, preventSelfReview: true },
    requiredProtectedBranches: ["main"],
    allowAdminBypass: false,
  },
};

const environment = {
  name: "production",
  protection_rules: [{ type: "required_reviewers", prevent_self_review: true, reviewers: [{ type: "User", reviewer: { login: "owner" } }] }],
  deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
};

test("accepts the required reviewer, self-review, branch, and protection contract", () => {
  const checks = evaluateProductionEnvironment(environment, config, { main: true });
  assert.equal(checks.some((item) => item.status === "fail"), false);
  assert.equal(checks.find((item) => item.name === "Administrator bypass").status, "manual");
});

test("fails closed when required reviewers are missing", () => {
  const checks = evaluateProductionEnvironment({ ...environment, protection_rules: [] }, config, { main: true });
  assert.ok(checks.some((item) => item.name === "Required reviewers" && item.status === "fail"));
});

test("accepts a repository ruleset when classic branch protection is unavailable", () => {
  const runner = (command, args) => {
    const key = `${command} ${args.join(" ")}`;
    if (key === "gh repo view --json nameWithOwner,isPrivate") return { exitCode: 0, stdout: JSON.stringify({ nameWithOwner: "owner/repo", isPrivate: false }) };
    if (key === "gh api repos/owner/repo/environments/production") return { exitCode: 0, stdout: JSON.stringify(environment) };
    if (key === "gh api repos/owner/repo/branches/main/protection") return { exitCode: 1, stdout: "" };
    if (key === "gh api repos/owner/repo/rules/branches/main") return { exitCode: 0, stdout: JSON.stringify([{ type: "pull_request" }]) };
    return { exitCode: 1, stdout: "" };
  };
  const report = collectProductionEnvironmentDoctor({ repoRoot: "/repo", runner, config });
  assert.equal(report.checks.find((item) => item.name === "Protected branch main").status, "pass");
});

test("uses read-only GitHub API requests for environment and branch protection", () => {
  const calls = [];
  const runner = (command, args) => {
    calls.push([command, ...args]);
    const key = `${command} ${args.join(" ")}`;
    if (key === "gh repo view --json nameWithOwner,isPrivate") return { exitCode: 0, stdout: JSON.stringify({ nameWithOwner: "owner/repo", isPrivate: false }) };
    if (key === "gh api repos/owner/repo/environments/production") return { exitCode: 0, stdout: JSON.stringify(environment) };
    if (key === "gh api repos/owner/repo/branches/main/protection") return { exitCode: 0, stdout: "{}" };
    return { exitCode: 1, stdout: "" };
  };
  const report = collectProductionEnvironmentDoctor({ repoRoot: "/repo", runner, config });
  assert.equal(report.checks.some((item) => item.status === "fail"), false);
  assert.equal(calls.some((call) => call.includes("--method")), false);
  assert.equal(calls.every((call) => !["POST", "PUT", "PATCH", "DELETE"].includes(call[1])), true);
});

