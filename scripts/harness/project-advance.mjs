import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendHistory, canonicalRoot, manifest, parseOptions, readJson, sha256Files, transitionFor, writeJsonAtomic } from "./full-lifecycle-lib.mjs";
import { proposedProfileIds } from "./design-lib.mjs";

function pendingGate() {
  return { status: "pending", approvedBy: null, approvedAt: null, reason: null, contractHash: null };
}

function assertFreshGate(repoRoot, project, name) {
  const definition = manifest(repoRoot).projectGates?.[name];
  const record = project.phaseGates?.[name];
  if (!definition || !record || record.status !== "approved") throw new Error(`Missing approved project gate: ${name}.`);
  const digest = sha256Files(repoRoot, definition.requiredDocuments);
  if (record.contractHash !== digest) throw new Error(`Approved project gate ${name} is stale.`);
  return { record, digest };
}

export function advanceProject(repoRoot, options) {
  if (!options.to) throw new Error("Usage: project:advance -- --to <STATE>");
  const file = path.join(repoRoot, "harness/project.json");
  const project = readJson(file);
  const transition = transitionFor(repoRoot, "project", project.state, options.to);
  let actor = "system";
  let reason = "deterministic transition";
  let digest = sha256Files(repoRoot, transition.requiredDocuments);

  if (transition.approval === "human") {
    const approval = project.pendingApproval;
    if (!approval || approval.targetState !== options.to) throw new Error(`Missing human approval for ${project.state} -> ${options.to}.`);
    if (digest !== approval.contractHash) throw new Error("Approved project contract changed after approval.");
    actor = approval.approvedBy;
    reason = approval.reason;
  } else if (transition.approval.startsWith("gate:")) {
    const gateName = transition.approval.slice("gate:".length);
    const checked = assertFreshGate(repoRoot, project, gateName);
    actor = checked.record.approvedBy;
    reason = checked.record.reason;
    digest = checked.digest;
  }

  if (options.to === "ACTIVE") {
    if (!project.projectId || project.projectId === "change-me") throw new Error("ACTIVE requires a real projectId (replace bootstrap value change-me).");
    if (project.state === "DESIGNING") {
      for (const name of ["planning", "stack", "architecture", "design"]) assertFreshGate(repoRoot, project, name);
    }
    if (!project.profileResolutionPath) throw new Error("ACTIVE requires a recorded profile resolution.");
    const resolution = readJson(path.join(repoRoot, project.profileResolutionPath));
    if (resolution.status !== "resolved") throw new Error("Profile resolution is not resolved.");
    const registryDigest = crypto.createHash("sha256").update(fs.readFileSync(path.join(repoRoot, "harness/profiles/registry.json"))).digest("hex");
    if (resolution.registrySha256 !== registryDigest) throw new Error("Profile resolution is stale; run profile:resolve again.");
    const expected = proposedProfileIds(project);
    if (expected.length && expected.some((id) => !resolution.resolvedProfiles.includes(id))) throw new Error("Profile resolution does not cover the approved profile candidates.");
    project.activeProfiles = resolution.resolvedProfiles;
  }

  const from = project.state;
  appendHistory(project, from, options.to, actor, reason, digest);
  project.state = options.to;
  project.pendingApproval = null;

  if (from === "DESIGNING" && options.to === "PLANNING") {
    project.phaseGates = { planning: pendingGate(), stack: pendingGate(), architecture: pendingGate(), design: pendingGate() };
    project.activeDesignSession = undefined;
  }
  if (options.to === "ACTIVE") project.migration = null;
  writeJsonAtomic(file, project);
  return { from, state: project.state, activeProfiles: project.activeProfiles };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  try { console.log(JSON.stringify(advanceProject(canonicalRoot, options), null, 2)); }
  catch (error) { console.error(error.message); process.exit(1); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
