import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertCommit, assertDesignReadyContent, assertScopeReadyContent, designContractHash, designDocumentPath, nowIso, readActive, saveGate, scopeContractHash } from "./lifecycle-gates.mjs";
import { localDate } from "./time.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function buildMigratedGate({ template, existingGate = null, taskId, actor, reason, baselineSha, scopeHash, designHash, designDocument, at }) {
  const gate = structuredClone(template);
  gate.taskId = taskId;
  gate.scopeApproval = { status: "approved", approvedBy: actor, approvedAt: at, reason, contractHash: scopeHash };
  gate.designApproval = { status: "approved", approvedBy: actor, approvedAt: at, reason, contractHash: designHash, baselineSha, designDocument };
  gate.history = [
    ...(Array.isArray(existingGate?.history) ? existingGate.history : []),
    { action: "v15-phase-gate-migration", actor, reason, at, fromSchemaVersion: existingGate?.schemaVersion ?? "legacy" },
  ];
  return gate;
}

export function migratedTaskState(legacyState) {
  if (["IDEA", "SPEC_READY", "PLAN_READY"].includes(legacyState)) return "DESIGNING";
  if (["IMPLEMENTING", "VERIFYING", "REVIEW_READY", "DEPLOY_READY"].includes(legacyState)) return "DEVELOPING";
  if (["DESIGNING", "DEVELOPING", "VERIFYING", "REVIEWING", "DEPLOY_READY"].includes(legacyState)) {
    throw new Error(`Task status ${legacyState} already uses the v15 lifecycle; migrate only the legacy gate manually if required.`);
  }
  if (legacyState === "DONE") throw new Error("A DONE task should not remain active; complete/archive it under v14 before gate migration.");
  throw new Error(`Unsupported legacy task status: ${legacyState}`);
}

function migratedActiveText(active, targetState) {
  return active.text
    .replace(/status:\s*\S+/, `status: ${targetState}`)
    .replace(/updated_at:\s*\S+/, `updated_at: ${localDate()}`);
}

function parseArgs(raw) {
  const args = {};
  for (let i = 0; i < raw.length; i += 2) {
    const key = raw[i];
    const value = raw[i + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(`Invalid migration argument near ${key ?? "<end>"}.`);
    args[key.slice(2)] = value;
  }
  return args;
}

export function migrateLegacyGate(root, argv) {
  const args = parseArgs(argv);
  const active = readActive(root);
  if (active.activeSpec === "none") throw new Error("No active task.");
  const actor = args["approved-by"]?.trim();
  const reason = args.reason?.trim();
  const baselineSha = args["base-sha"];
  if (!/^human:\S+$/.test(actor ?? "") || !reason || !baselineSha) throw new Error("--approved-by human:<name>, --reason, and --base-sha are required.");
  assertCommit(root, baselineSha);
  const targetState = migratedTaskState(active.status);

  // A v15 migration approval is a fresh human approval, not a fabricated conversion
  // of the old gate. Refuse incomplete scope/design before creating backups.
  assertScopeReadyContent(root, active.activeSpec);
  assertDesignReadyContent(root, active.activeSpec);

  const template = JSON.parse(fs.readFileSync(path.join(root, "docs/specs/TEMPLATE/gate.json"), "utf8"));
  const gatePath = path.join(root, "docs/specs", active.activeSpec, "gate.json");
  let existingGate = null;
  let backup = null;
  if (fs.existsSync(gatePath)) {
    existingGate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
    if (existingGate.schemaVersion === "2.0.0") throw new Error("Lifecycle gate is already schema 2.0.0.");
    if (!new Set(["1.0.0", "1.1.0"]).has(existingGate.schemaVersion)) throw new Error(`Only lifecycle gate schema 1.0.0 or 1.1.0 can be migrated; found ${existingGate.schemaVersion ?? "unknown"}.`);
    backup = path.join(path.dirname(gatePath), `gate.v${existingGate.schemaVersion}.backup.json`);
    if (fs.existsSync(backup)) throw new Error("Migration backup already exists; inspect it before retrying.");
  }
  const activeBackup = path.join(path.dirname(active.activePath), "_active.v14.backup.md");
  if (fs.existsSync(activeBackup)) throw new Error("Active-task migration backup already exists; inspect it before retrying.");

  const designPath = designDocumentPath(root, active.activeSpec);
  if (!fs.existsSync(designPath)) throw new Error("Neither design.md nor legacy plan.md exists for the active task.");
  const at = nowIso();
  const migrated = buildMigratedGate({
    template,
    existingGate,
    taskId: active.activeSpec,
    actor,
    reason,
    baselineSha,
    scopeHash: scopeContractHash(root, active.activeSpec),
    designHash: designContractHash(root, active.activeSpec),
    designDocument: path.relative(root, designPath).replaceAll("\\", "/"),
    at,
  });
  if (backup) fs.copyFileSync(gatePath, backup, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(active.activePath, activeBackup, fs.constants.COPYFILE_EXCL);
  saveGate(gatePath, migrated);
  fs.writeFileSync(active.activePath, migratedActiveText(active, targetState), "utf8");
  return {
    taskId: active.activeSpec,
    previousStatus: active.status,
    status: targetState,
    gate: path.relative(root, gatePath).replaceAll("\\", "/"),
    backup: backup ? path.relative(root, backup).replaceAll("\\", "/") : null,
    activeBackup: path.relative(root, activeBackup).replaceAll("\\", "/"),
    legacyDesignDocument: designPath.endsWith("/plan.md") || designPath.endsWith("\\plan.md"),
    downstreamEvidence: "reset-to-pending",
  };
}

export function main(argv = process.argv.slice(2)) {
  console.log(JSON.stringify(migrateLegacyGate(repoRoot, argv), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}
