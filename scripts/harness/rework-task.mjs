import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGate, nowIso, readActive, resetDownstream, saveGate } from "./lifecycle-gates.mjs";
import { localDate } from "./time.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i += 1) {
  if (!raw[i]?.startsWith("--")) continue;
  const key = raw[i].slice(2); const value = raw[i + 1];
  if (value && !value.startsWith("--")) { args[key] = value; i += 1; }
  else args[key] = "true";
}
try {
  const active = readActive(repoRoot);
  const allowed = new Set(["DEVELOPING", "VERIFYING", "REVIEWING", "DEPLOY_READY"]);
  if (!allowed.has(active.status)) throw new Error("Rework is allowed only from DEVELOPING, VERIFYING, REVIEWING, or DEPLOY_READY.");
  const actor = args.by?.trim();
  const reason = args.reason?.trim();
  if (!actor || !reason) throw new Error("--by and --reason are required.");
  if (active.status === "DEPLOY_READY" && args["human-approved"] !== "true") throw new Error("DEPLOY_READY rework requires --human-approved true.");
  const target = args.target === "design" ? "DESIGNING" : "DEVELOPING";
  const { gate, gatePath } = loadGate(repoRoot, active.activeSpec);
  resetDownstream(gate, "implementation");
  if (target === "DESIGNING") {
    gate.designApproval = { status: "pending", approvedBy: null, approvedAt: null, reason: null, contractHash: null, baselineSha: null, designDocument: null };
  }
  gate.history.push({ action: target === "DESIGNING" ? "design-rework" : "implementation-rework", actor, reason, at: nowIso(), from: active.status, to: target });
  saveGate(gatePath, gate);
  const today = localDate();
  fs.writeFileSync(active.activePath, active.text.replace(/status:\s*\S+/, `status: ${target}`).replace(/updated_at:\s*\S+/, `updated_at: ${today}`));
  console.log(JSON.stringify({ taskId: active.activeSpec, previousStatus: active.status, status: target }, null, 2));
} catch (error) { console.error(error.message); process.exit(1); }
