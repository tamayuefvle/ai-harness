import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoLikelySecret, canonicalRoot, manifest, parseOptions, readJson, requireHuman, sha256Files, transitionFor, writeJsonAtomic } from "./full-lifecycle-lib.mjs";
import { runProductCheck } from "./product-check.mjs";
import { runStackCheck } from "./stack-check.mjs";
import { runArchitectureCheck } from "./architecture-check.mjs";
import { proposedProfileIds, syncProposedProfiles, validateStackDocuments } from "./design-lib.mjs";

function pendingGate() {
  return { status: "pending", approvedBy: null, approvedAt: null, reason: null, contractHash: null };
}

function assertFreshProjectGate(repoRoot, project, name) {
  const definition = manifest(repoRoot).projectGates?.[name];
  if (!definition) throw new Error(`Unknown project phase gate: ${name}`);
  const record = project.phaseGates?.[name];
  if (!record || record.status !== "approved") throw new Error(`Project gate ${name} is not approved.`);
  const digest = sha256Files(repoRoot, definition.requiredDocuments);
  if (record.contractHash !== digest) throw new Error(`Project gate ${name} is stale; its approved documents changed.`);
  return record;
}

function assertResolvedProfiles(repoRoot, project) {
  if (!project.profileResolutionPath) throw new Error("Design approval requires a recorded profile resolution path.");
  const file = path.join(repoRoot, project.profileResolutionPath);
  if (!fs.existsSync(file)) throw new Error("Design approval requires harness/generated/profile-resolution.json.");
  const resolution = readJson(file);
  if (resolution.status !== "resolved") throw new Error("Profile resolution is not resolved; run npm run profile:resolve first.");
  const registryDigest = crypto.createHash("sha256").update(fs.readFileSync(path.join(repoRoot, "harness/profiles/registry.json"))).digest("hex");
  if (resolution.registrySha256 !== registryDigest) throw new Error("Profile resolution is stale; run profile:resolve again.");
  const expected = proposedProfileIds(project);
  if (expected.length && expected.some((id) => !resolution.resolvedProfiles?.includes(id))) {
    throw new Error("Profile resolution does not cover the approved profile candidates.");
  }
}

function runChecker(repoRoot, project, name) {
  if (name === "planning") runProductCheck(repoRoot, { forGate: true, strict: true });
  if (name === "stack") {
    runStackCheck(repoRoot, { forGate: true, strict: true });
    const stack = validateStackDocuments(repoRoot);
    const sync = syncProposedProfiles(repoRoot, stack.selectedProfiles);
    project.proposedProfiles = sync.proposedProfiles;
    if (sync.copied && project.migration && Array.isArray(project.migration.proposedProfiles) && project.migration.proposedProfiles.length === 0) {
      project.migration.proposedProfiles = [...sync.proposedProfiles];
    }
  }
  if (name === "architecture") {
    assertFreshProjectGate(repoRoot, project, "stack");
    runArchitectureCheck(repoRoot, { forGate: true, strict: true });
  }
  if (name === "design") {
    assertFreshProjectGate(repoRoot, project, "planning");
    assertFreshProjectGate(repoRoot, project, "stack");
    assertFreshProjectGate(repoRoot, project, "architecture");
    runStackCheck(repoRoot, { forGate: true, strict: true });
    runArchitectureCheck(repoRoot, { forGate: true, strict: true });
    assertResolvedProfiles(repoRoot, project);
  }
}

export function runProjectGate(repoRoot, options) {
  requireHuman(options.actor);
  assertNoLikelySecret(options.reason ?? "");
  if (!options.reason) throw new Error("--reason is required.");
  const file = path.join(repoRoot, "harness/project.json");
  const project = readJson(file);
  project.phaseGates ??= { planning: pendingGate(), stack: pendingGate(), architecture: pendingGate(), design: pendingGate() };

  if (options.gate) {
    const name = options.gate;
    const definition = manifest(repoRoot).projectGates?.[name];
    if (!definition) throw new Error(`Unknown project phase gate: ${name}`);
    if (project.state !== definition.phase) throw new Error(`Project gate ${name} belongs to ${definition.phase}; current state is ${project.state}.`);
    runChecker(repoRoot, project, name);
    const contractHash = sha256Files(repoRoot, definition.requiredDocuments);
    project.phaseGates[name] = {
      status: "approved",
      approvedBy: options.actor,
      approvedAt: new Date().toISOString(),
      reason: options.reason,
      contractHash,
    };
    const order = ["planning", "stack", "architecture", "design"];
    const index = order.indexOf(name);
    for (const downstream of order.slice(index + 1)) project.phaseGates[downstream] = pendingGate();
    writeJsonAtomic(file, project);
    return { state: project.state, gate: name, requiredDocuments: definition.requiredDocuments, contractHash };
  }

  if (!options.to) throw new Error("Usage: project:gate -- --gate <planning|stack|architecture|design> --actor human:<name> --reason <text> OR --to <STATE> for explicit human lifecycle transitions.");
  const transition = transitionFor(repoRoot, "project", project.state, options.to);
  if (transition.approval !== "human") throw new Error(`${project.state} -> ${options.to} is controlled by ${transition.approval}; approve the named phase gate instead.`);
  const contractHash = sha256Files(repoRoot, transition.requiredDocuments);
  project.pendingApproval = { targetState: options.to, approvedBy: options.actor, approvedAt: new Date().toISOString(), reason: options.reason, contractHash };
  writeJsonAtomic(file, project);
  return { from: project.state, to: options.to, requiredDocuments: transition.requiredDocuments, contractHash };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  try { console.log(JSON.stringify(runProjectGate(canonicalRoot, options), null, 2)); }
  catch (error) {
    console.error(error.message);
    if (error.details) for (const detail of error.details) console.error(`- ${detail}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
