import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readActive, resolveRepositoryFile } from "./lifecycle-gates.mjs";
import { validateReviewArtifact } from "./artifact-validator.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function resolveWithinRepo(candidate) {
  if (!candidate || typeof candidate !== "string") throw new Error("Diagnostic evidence report path is required.");
  const resolved = resolveRepositoryFile(repoRoot, candidate, "Diagnostic evidence");
  return { absolute: resolved.absolute, relative: resolved.path };
}

export function finalizeReviewReport({ report, taskId, headSha, resolveEvidence }) {
  report.schema_version = "1.0.0";
  report.task_id = taskId;
  report.head_sha = headSha;
  if (!Array.isArray(report.diagnostic_evidence) || report.diagnostic_evidence.length === 0) {
    throw new Error("Review report requires at least one diagnostic_evidence item.");
  }
  for (const item of report.diagnostic_evidence) {
    const evidence = resolveEvidence(item.report);
    item.report = evidence.relative;
    item.sha256 = crypto.createHash("sha256").update(fs.readFileSync(evidence.absolute)).digest("hex");
  }
  return report;
}

export function main(argv = process.argv.slice(2)) {
  const [input, expectedTaskId, expectedHeadSha] = argv;
  if (!input) throw new Error("Usage: node scripts/harness/finalize-review-report.mjs <review-report.json> [expected-task-id] [expected-head-sha]");
  const target = resolveWithinRepo(input);
  const active = readActive(repoRoot);
  if (active.activeSpec === "none") throw new Error("No active task.");
  if (expectedTaskId && active.activeSpec !== expectedTaskId) throw new Error(`Active task changed during review: ${active.activeSpec} != ${expectedTaskId}`);
  const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  if (expectedHeadSha && headSha !== expectedHeadSha) throw new Error(`Repository HEAD changed during review: ${headSha} != ${expectedHeadSha}`);
  const report = JSON.parse(fs.readFileSync(target.absolute, "utf8"));
  const finalized = finalizeReviewReport({
    report,
    taskId: active.activeSpec,
    headSha,
    resolveEvidence(candidate) {
      const evidence = resolveWithinRepo(candidate);
      if (evidence.absolute === target.absolute) throw new Error("Review report cannot cite itself as diagnostic evidence.");
      return evidence;
    },
  });
  const temporary = `${target.absolute}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(finalized, null, 2)}\n`, "utf8");
    validateReviewArtifact(temporary, active.activeSpec, headSha);
    fs.renameSync(temporary, target.absolute);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log(`Finalized review report: ${target.relative}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
