import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoLikelySecret, canonicalRoot, parseOptions, readJson, requireHuman, sha256Files, transitionFor, writeJsonAtomic } from "./full-lifecycle-lib.mjs";
import { runProductCheck } from "./product-check.mjs";
import { runStackCheck } from "./stack-check.mjs";
import { runArchitectureCheck } from "./architecture-check.mjs";
import { syncProposedProfiles, validateStackDocuments } from "./design-lib.mjs";

export function runProjectGate(repoRoot, options) {
  requireHuman(options.actor);
  assertNoLikelySecret(options.reason ?? "");
  if (!options.to || !options.reason) {
    throw new Error("Usage: project:gate -- --to <STATE> --actor human:<name> --reason <text>");
  }
  const file = path.join(repoRoot, "harness/project.json");
  const project = readJson(file);
  const transition = transitionFor(repoRoot, "project", project.state, options.to);
  if (project.state === "DISCOVERY" && options.to === "PRODUCT_APPROVED") {
    runProductCheck(repoRoot, { forGate: true, strict: true });
  }
  if (project.state === "PRODUCT_APPROVED" && options.to === "STACK_APPROVED") {
    runStackCheck(repoRoot, { forGate: true, strict: true });
    const stack = validateStackDocuments(repoRoot);
    const sync = syncProposedProfiles(repoRoot, stack.selectedProfiles);
    project.proposedProfiles = sync.proposedProfiles;
    if (sync.copied && project.migration && Array.isArray(project.migration.proposedProfiles) && project.migration.proposedProfiles.length === 0) {
      project.migration.proposedProfiles = [...sync.proposedProfiles];
    }
  }
  if (project.state === "STACK_APPROVED" && options.to === "ARCHITECTURE_APPROVED") {
    runArchitectureCheck(repoRoot, { forGate: true, strict: true });
  }
  const docs = transition.requiredDocuments;
  const contractHash = sha256Files(repoRoot, docs);
  project.pendingApproval = {
    targetState: options.to,
    approvedBy: options.actor,
    approvedAt: new Date().toISOString(),
    reason: options.reason,
    contractHash,
  };
  writeJsonAtomic(file, project);
  return { from: project.state, to: options.to, requiredDocuments: docs, contractHash };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  try {
    console.log(JSON.stringify(runProjectGate(canonicalRoot, options), null, 2));
  } catch (error) {
    console.error(error.message);
    if (error.details) {
      for (const detail of error.details) console.error(`- ${detail}`);
    }
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
