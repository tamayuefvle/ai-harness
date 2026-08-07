import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { deriveImplementationEvidence, fingerprintChanges, loadGate, readActive, verifyEvidence } from "../harness/lifecycle-gates.mjs";
import { assertTaskId } from "../harness/task-id.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const run = (command, ...args) => execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};

try {
  const task = arg("--task");
  const base = arg("--base") || "main";
  const createPr = arg("--create-pr") !== "false";
  assertTaskId(task, "--task");
  const active = readActive(root);
  if (active.activeSpec !== task) throw new Error(`Active task mismatch: ${active.activeSpec} != ${task}`);
  if (!new Set(["IMPLEMENTING", "VERIFYING", "REVIEW_READY", "DEPLOY_READY"]).has(active.status)) throw new Error(`Push proposal is not allowed from ${active.status}`);
  const { gate } = loadGate(root, task);
  if (gate.implementation.status !== "passed") throw new Error("Passed implementation evidence is required before push proposal");
  verifyEvidence(root, gate.implementation.reportPath, gate.implementation.reportSha256, "Implementation");
  const implementation = deriveImplementationEvidence(root, gate.implementation.reportPath, task);
  if (implementation.status !== "passed" || implementation.status !== gate.implementation.status) throw new Error("Implementation report does not support a passed push proposal");
  if (fingerprintChanges(root, gate.planApproval.baselineSha, task) !== gate.implementation.changeFingerprint) throw new Error("Implementation change set differs from recorded evidence");

  const remote = run("git", "remote", "get-url", "origin");
  const branch = run("git", "branch", "--show-current");
  const head = run("git", "rev-parse", "HEAD");
  const status = run("git", "status", "--porcelain");
  if (!/^https:\/\/github\.com\//.test(remote)) throw new Error("origin must use GitHub HTTPS");
  if (!branch || ["main", "master"].includes(branch)) throw new Error("protected or detached branch");
  if (status) throw new Error("worktree must be clean before proposal");

  const repo = remote.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  const files = run("git", "diff", "--name-only", `${base}...HEAD`).split("\n").filter(Boolean);
  if (!files.length) throw new Error("no changed files against base");
  const operation = createPr ? "push-and-create-pr" : "push";
  const commands = [`git push --set-upstream origin ${branch}`];
  if (createPr) commands.push(`gh pr create --base ${base} --head ${branch} --body-file <approved-body-file>`);
  const proposal = {
    schemaVersion: "1.1.0",
    operation,
    repository: repo,
    remote,
    branch,
    baseBranch: base,
    localHead: head,
    files: { included: files, unexpected: [] },
    evidence: {
      implementation: { status: "passed", report: gate.implementation.reportPath },
      verification: gate.verification.status === "passed" ? { status: "passed", report: gate.verification.reportPath } : { status: "pending", report: null },
      review: gate.review.verdict === "approved" ? { status: "approved", report: gate.review.reportPath } : { status: "pending", report: null }
    },
    commands,
    requiresHumanApproval: true
  };
  const output = path.join(root, ".harness/reports", task, "github-push-proposal.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(proposal, null, 2)}\n`);
  console.log(output);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
