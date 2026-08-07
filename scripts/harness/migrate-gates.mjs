import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertCommit, nowIso, planContractHash, readActive, saveGate, specContractHash } from "./lifecycle-gates.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function buildMigratedGate({ template, existingGate = null, taskId, actor, reason, baselineSha, specHash, planHash, at }) {
  const gate = structuredClone(template);
  gate.taskId = taskId;
  gate.specApproval = { status: "approved", approvedBy: actor, approvedAt: at, reason, contractHash: specHash };
  gate.planApproval = { status: "approved", approvedBy: actor, approvedAt: at, reason, contractHash: planHash, baselineSha };
  gate.history = [
    ...(Array.isArray(existingGate?.history) ? existingGate.history : []),
    { action: existingGate ? "schema-1.1-migration" : "legacy-migration", actor, reason, at, fromSchemaVersion: existingGate?.schemaVersion ?? null },
  ];
  return gate;
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

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const active = readActive(repoRoot);
  if (active.activeSpec === "none") throw new Error("No active task.");
  const actor = args["approved-by"]?.trim();
  const reason = args.reason?.trim();
  const baselineSha = args["base-sha"];
  if (!actor || !reason || !baselineSha) throw new Error("--approved-by, --reason, and --base-sha are required.");
  assertCommit(repoRoot, baselineSha);

  const template = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs/specs/TEMPLATE/gate.json"), "utf8"));
  const gatePath = path.join(repoRoot, "docs/specs", active.activeSpec, "gate.json");
  let existingGate = null;
  let backup = null;
  if (fs.existsSync(gatePath)) {
    existingGate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
    if (existingGate.schemaVersion !== "1.0.0") throw new Error(`Only lifecycle gate schema 1.0.0 can be migrated; found ${existingGate.schemaVersion ?? "unknown"}.`);
    backup = path.join(path.dirname(gatePath), "gate.v1.0.0.backup.json");
    if (fs.existsSync(backup)) throw new Error("Migration backup already exists; inspect it before retrying.");
    fs.copyFileSync(gatePath, backup, fs.constants.COPYFILE_EXCL);
  }

  const at = nowIso();
  const migrated = buildMigratedGate({
    template,
    existingGate,
    taskId: active.activeSpec,
    actor,
    reason,
    baselineSha,
    specHash: specContractHash(repoRoot, active.activeSpec),
    planHash: planContractHash(repoRoot, active.activeSpec),
    at,
  });
  saveGate(gatePath, migrated);
  console.log(JSON.stringify({
    taskId: active.activeSpec,
    gate: path.relative(repoRoot, gatePath).replaceAll("\\", "/"),
    backup: backup ? path.relative(repoRoot, backup).replaceAll("\\", "/") : null,
    downstreamEvidence: "reset-to-pending",
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
