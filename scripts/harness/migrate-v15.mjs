import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalRoot, manifest, readJson, sha256Files, writeJsonAtomic } from "./full-lifecycle-lib.mjs";

const root = canonicalRoot;
const file = path.join(root, "harness/project.json");
const pending = () => ({ status:"pending", approvedBy:null, approvedAt:null, reason:null, contractHash:null });
const gateSet = () => ({ planning:pending(), stack:pending(), architecture:pending(), design:pending() });

function preflightLegacyTechnologyDocs(repoRoot) {
  for (const name of ["technology-options.md", "technology-decision.md"]) {
    const from = path.join(repoRoot, "docs/product", name);
    const to = path.join(repoRoot, "docs/architecture", name);
    if (fs.existsSync(from) && fs.existsSync(to) && !fs.readFileSync(from).equals(fs.readFileSync(to))) {
      throw new Error(`Both legacy and v15 technology documents exist with different content: ${name}`);
    }
  }
}

function moveLegacyTechnologyDocs(repoRoot) {
  const moved = [];
  for (const name of ["technology-options.md", "technology-decision.md"]) {
    const from = path.join(repoRoot, "docs/product", name);
    const to = path.join(repoRoot, "docs/architecture", name);
    if (!fs.existsSync(from)) continue;
    if (fs.existsSync(to)) {
      if (!fs.readFileSync(from).equals(fs.readFileSync(to))) throw new Error(`Both legacy and v15 technology documents exist with different content: ${name}`);
      fs.unlinkSync(from);
    } else {
      fs.mkdirSync(path.dirname(to), { recursive:true });
      fs.renameSync(from, to);
    }
    moved.push(`docs/architecture/${name}`);
  }
  return moved;
}

function historicalApproval(project, targetStates) {
  const rows = [...(project.history ?? [])].reverse();
  return rows.find((row) => targetStates.includes(row.to) && /^human:\S+$/.test(row.actor ?? "") && row.reason && row.at) ?? null;
}

function approveFromHistory(repoRoot, next, gateName, legacyStates, project) {
  const proof = historicalApproval(project, legacyStates);
  const definition = manifest(repoRoot).projectGates[gateName];
  if (!proof || !definition.requiredDocuments.every((p) => fs.existsSync(path.join(repoRoot,p)))) return false;
  next.phaseGates[gateName] = {
    status:"approved", approvedBy:proof.actor, approvedAt:proof.at, reason:`Migrated v14 approval: ${proof.reason}`,
    contractHash:sha256Files(repoRoot, definition.requiredDocuments),
  };
  return true;
}

export function migrateProject(repoRoot = root) {
  if (!fs.existsSync(path.join(repoRoot,"harness/project.json"))) throw new Error("harness/project.json is missing.");
  const projectFile = path.join(repoRoot,"harness/project.json");
  const old = readJson(projectFile);
  if (old.schemaVersion === "2.0.0") return { changed:false, state:old.state, movedTechnologyDocs:[] };
  const backup = path.join(repoRoot,"harness/project.v14.backup.json");
  if (fs.existsSync(backup)) throw new Error("harness/project.v14.backup.json already exists; inspect it before retrying migration.");
  preflightLegacyTechnologyDocs(repoRoot);
  fs.copyFileSync(projectFile, backup, fs.constants.COPYFILE_EXCL);
  const movedTechnologyDocs = moveLegacyTechnologyDocs(repoRoot);
  const oldState = old.state ?? "MIGRATION_PENDING";
  const next = {
    schemaVersion:"2.0.0",
    projectId:old.projectId ?? "change-me",
    lifecycleMode:old.lifecycleMode ?? "full",
    state:"PLANNING",
    planningTier:old.planningTier ?? old.discoveryTier ?? "full",
    designTier:old.designTier ?? "full",
    phaseGates:gateSet(),
    pendingApproval:null,
    decisionRefs:(old.decisionRefs ?? []).map((ref) => ref.replace("docs/product/technology-", "docs/architecture/technology-")),
    activeProfiles:old.activeProfiles ?? [],
    proposedProfiles:old.proposedProfiles ?? old.migration?.proposedProfiles ?? [],
    profileResolutionPath:old.profileResolutionPath ?? "harness/generated/profile-resolution.json",
    migration:{
      fromVersion:"14.9.4", fromState:oldState,
      proposedProfiles:old.proposedProfiles ?? old.migration?.proposedProfiles ?? [],
      notes:"v15 phase/gate migration. Legacy plan.md remains valid for existing task designs; new tasks use design.md.",
    },
    history:old.history ?? [],
  };

  if (old.activeDiscoverySession) next.activePlanningSession = old.activeDiscoverySession;
  if (old.activeDesignSession) next.activeDesignSession = old.activeDesignSession;

  const planningProof = approveFromHistory(repoRoot,next,"planning",["PRODUCT_APPROVED","STACK_APPROVED","ARCHITECTURE_APPROVED","ACTIVE"],old);
  let stackProof = false, architectureProof = false;
  if (planningProof) stackProof = approveFromHistory(repoRoot,next,"stack",["STACK_APPROVED","ARCHITECTURE_APPROVED","ACTIVE"],old);
  if (stackProof) architectureProof = approveFromHistory(repoRoot,next,"architecture",["ARCHITECTURE_APPROVED","ACTIVE"],old);

  if (oldState === "MIGRATION_PENDING") next.state = "MIGRATION_PENDING";
  else if (oldState === "DISCOVERY") next.state = "PLANNING";
  else if (["PRODUCT_APPROVED","STACK_APPROVED","ARCHITECTURE_APPROVED"].includes(oldState)) next.state = planningProof ? "DESIGNING" : "PLANNING";
  else if (oldState === "ACTIVE") {
    next.state = "ACTIVE";
    // ACTIVE remains ACTIVE to preserve an already-approved delivery baseline. Do not fabricate missing v15 gate proof.
    if (planningProof && stackProof && architectureProof) {
      const designDef = manifest(repoRoot).projectGates.design;
      if (designDef.requiredDocuments.every((p) => fs.existsSync(path.join(repoRoot,p)))) {
        const proof = historicalApproval(old,["ACTIVE"]);
        if (proof) next.phaseGates.design = { status:"approved", approvedBy:proof.actor, approvedAt:proof.at, reason:`Migrated v14 ACTIVE approval: ${proof.reason}`, contractHash:sha256Files(repoRoot, designDef.requiredDocuments) };
      }
    }
  } else if (oldState === "RETIRED") next.state = "RETIRED";
  else throw new Error(`Unsupported v14 project state: ${oldState}`);

  writeJsonAtomic(projectFile,next);
  return { changed:true, fromState:oldState, state:next.state, backup:"harness/project.v14.backup.json", movedTechnologyDocs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(migrateProject(root),null,2)); } catch (error) { console.error(error.message); process.exit(1); }
}
