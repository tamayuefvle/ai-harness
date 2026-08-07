import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertCommit, loadGate, nowIso, planContractHash, readActive, resetDownstream, saveGate } from "./lifecycle-gates.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i += 2) args[raw[i]?.replace(/^--/, "")] = raw[i + 1];
try {
  const active = readActive(repoRoot);
  if (!new Set(["PLAN_READY", "IMPLEMENTING"]).has(active.status)) throw new Error("Rebaseline is allowed only in PLAN_READY or IMPLEMENTING.");
  const sha = args["base-sha"];
  const actor = args["approved-by"]?.trim();
  const reason = args.reason?.trim();
  if (!sha || !actor || !reason) throw new Error("--base-sha, --approved-by, and --reason are required.");
  assertCommit(repoRoot, sha);
  const { gate, gatePath } = loadGate(repoRoot, active.activeSpec);
  gate.planApproval = { status: "approved", approvedBy: actor, approvedAt: nowIso(), reason, contractHash: planContractHash(repoRoot, active.activeSpec), baselineSha: sha };
  resetDownstream(gate, "implementation");
  gate.history.push({ action: "rebaseline", actor, reason, at: nowIso(), baselineSha: sha });
  saveGate(gatePath, gate);
  console.log(JSON.stringify({ taskId: active.activeSpec, baselineSha: sha }, null, 2));
} catch (error) { console.error(error.message); process.exit(1); }
