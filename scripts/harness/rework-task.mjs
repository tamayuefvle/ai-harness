import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGate, nowIso, readActive, resetDownstream, saveGate } from "./lifecycle-gates.mjs";
import { localDate } from "./time.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, token, i, all) => token.startsWith("--") ? [...pairs, [token.slice(2), all[i + 1]]] : pairs, []));
try {
  const active = readActive(repoRoot);
  if (!new Set(["VERIFYING", "REVIEW_READY", "DEPLOY_READY"]).has(active.status)) throw new Error("Rework is allowed only from VERIFYING, REVIEW_READY, or DEPLOY_READY.");
  const actor = args.by?.trim();
  const reason = args.reason?.trim();
  if (!actor || !reason) throw new Error("--by and --reason are required.");
  if (active.status === "DEPLOY_READY" && args["human-approved"] !== "true") throw new Error("DEPLOY_READY rework requires --human-approved true.");
  const { gate, gatePath } = loadGate(repoRoot, active.activeSpec);
  resetDownstream(gate, "implementation");
  gate.history.push({ action: "rework", actor, reason, at: nowIso(), from: active.status });
  saveGate(gatePath, gate);
  const today = localDate();
  fs.writeFileSync(active.activePath, active.text.replace(/status:\s*\S+/, "status: IMPLEMENTING").replace(/updated_at:\s*\S+/, `updated_at: ${today}`));
  console.log(JSON.stringify({ taskId: active.activeSpec, previousStatus: active.status, status: "IMPLEMENTING" }, null, 2));
} catch (error) { console.error(error.message); process.exit(1); }
