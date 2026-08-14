import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendHistory, canonicalRoot, parseOptions, readJson, safeId, transitionFor, writeJsonAtomic } from "./full-lifecycle-lib.mjs";

function normalizeTier(value) {
  if (!value) return "full";
  if (value === "lite" || value === "full") return value;
  throw new Error("planning tier must be lite or full");
}

export function runProjectDiscover(repoRoot = canonicalRoot, options = {}) {
  const file = path.join(repoRoot, "harness/project.json");
  if (!fs.existsSync(file)) {
    throw new Error("harness/project.json is missing. Run bootstrap or npm run project:start first.");
  }
  const project = readJson(file);
  if (options.id) {
    project.projectId = safeId(options.id, /^[a-z0-9][a-z0-9-]{2,63}$/, "project id");
  }
  if (project.state === "PLANNING") {
    if (options.tier) project.planningTier = normalizeTier(options.tier);
    project.discoveryTier = project.planningTier;
    writeJsonAtomic(file, project);
    return { state: project.state, projectId: project.projectId, planningTier: project.planningTier ?? project.discoveryTier, changed: false };
  }
  if (project.state !== "MIGRATION_PENDING") {
    throw new Error(`project:plan applies only from MIGRATION_PENDING (current: ${project.state}).`);
  }
  transitionFor(repoRoot, "project", "MIGRATION_PENDING", "PLANNING");
  appendHistory(project, "MIGRATION_PENDING", "PLANNING", options.actor ?? "system", options.reason ?? "greenfield planning");
  project.state = "PLANNING";
  project.planningTier = normalizeTier(options.tier);
    project.discoveryTier = project.planningTier;
  project.pendingApproval = null;
  writeJsonAtomic(file, project);
  return { state: project.state, projectId: project.projectId, planningTier: project.planningTier ?? project.discoveryTier ?? "full", changed: true };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  try {
    const result = runProjectDiscover(canonicalRoot, {
      id: options.id,
      tier: options.tier,
      actor: options.actor,
      reason: options.reason,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
