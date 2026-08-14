import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertCommit, designContractHash, designDocumentPath, loadGate, nowIso, readActive, resetDownstream, saveGate } from "./lifecycle-gates.mjs";
import { requireHuman } from "./full-lifecycle-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i += 2) args[raw[i]?.replace(/^--/, "")] = raw[i + 1];
try {
  const active = readActive(repoRoot);
  if (active.status !== "DESIGNING") throw new Error("Rebaseline is allowed only in DESIGNING. Return to design before changing the implementation baseline.");
  const sha = args["base-sha"];
  const actor = args["approved-by"]?.trim();
  const reason = args.reason?.trim();
  if (!sha || !actor || !reason) throw new Error("--base-sha, --approved-by, and --reason are required.");
  requireHuman(actor);
  assertCommit(repoRoot, sha);
  const { gate, gatePath } = loadGate(repoRoot, active.activeSpec);
  if (gate.scopeApproval.status !== "approved") throw new Error("Scope must be confirmed before rebaselining design.");
  gate.designApproval = {
    status: "approved",
    approvedBy: actor,
    approvedAt: nowIso(),
    reason,
    contractHash: designContractHash(repoRoot, active.activeSpec),
    baselineSha: sha,
    designDocument: path.relative(repoRoot, designDocumentPath(repoRoot, active.activeSpec)).replaceAll("\\", "/"),
  };
  resetDownstream(gate, "implementation");
  gate.history.push({ action: "design-rebaseline", actor, reason, at: nowIso(), baselineSha: sha });
  saveGate(gatePath, gate);
  console.log(JSON.stringify({ taskId: active.activeSpec, designBaselineHash: gate.designApproval.contractHash, baselineSha: sha }, null, 2));
} catch (error) { console.error(error.message); process.exit(1); }
