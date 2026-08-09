import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertTaskId } from "./task-id.mjs";
import { appendEvent, assertLatestOperationApprovalFile, assertRunIntegrity, authorizePendingOperation, capabilityIndex, computeRunIntegrity, loadContracts, parseActiveTask, readEvents, readJson, resolveRunArtifact, sha256File, validateExecutionRun, validateOperationApproval, validateResume } from "./execution-lib.mjs";
import { assertProjectAllowsDelivery } from "./full-lifecycle-lib.mjs";
import { resolveRepositoryFile } from "./lifecycle-gates.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const roles = new Set(["orchestrator","researcher","planner","architect","implementer","verifier","reviewer","system-adapter","packager"]);
function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }
function now() { return new Date().toISOString(); }
function stamp() { return now().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
function random8() { return crypto.randomBytes(4).toString("hex"); }
function sha256Text(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function writeRun(file, run) {
  run.updatedAt = now();
  run.integrityHash = computeRunIntegrity(run);
  validateExecutionRun(run);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error("Execution run file must not be a symbolic link.");
  fs.writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
}
function relative(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function ensureInsideRunStore(file) {
  const resolved = resolveRunArtifact(root, file, "Run file");
  if (!/^\.harness\/runs\/[^/]+\/RUN-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.json$/.test(resolved.relative)) throw new Error("Run path must reference a canonical execution run JSON file.");
  return resolved.absolute;
}
function ensureApprovalForRun(runFile, input) {
  const resolved = resolveRunArtifact(root, input, "Operation approval");
  const expected = path.join(path.dirname(runFile), "approvals");
  if (path.dirname(resolved.absolute) !== expected || !/^OPA-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.json$/.test(path.basename(resolved.absolute))) throw new Error("Operation approval must be a canonical approval artifact for the selected run.");
  validateOperationApproval(readJson(resolved.absolute));
  return resolved.absolute;
}
function withRunLock(runFile, action) {
  const lockFile = `${runFile}.lock`;
  let fd;
  try {
    fd = fs.openSync(lockFile, "wx");
    fs.writeFileSync(fd, `${JSON.stringify({ pid: process.pid, acquiredAt: now() })}\n`);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("Execution run is locked; concurrent mutation is not allowed.");
    throw error;
  }
  try { return action(); }
  finally {
    try { if (fd !== undefined) fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(lockFile); } catch {}
  }
}
function eventBase(run, type, actorRole, extra = {}) { return { schemaVersion: "1.0.0", eventId: `EVT-${stamp()}-${random8()}`, runId: run.runId, sequence: 0, type, timestamp: now(), actorRole, operationRef: extra.operationRef ?? null, operationId: extra.operationId ?? null, artifactRef: extra.artifactRef ?? null, digest: extra.digest ?? null }; }

export function startRun(repoRoot = root, options = {}) {
  assertProjectAllowsDelivery(repoRoot);
  const active = parseActiveTask(repoRoot);
  const task = assertTaskId(options.task ?? active.activeSpec, "execution task ID");
  const role = options.role ?? "implementer";
  if (!roles.has(role)) throw new Error(`Unknown execution role: ${role}`);
  if (task === "none" || active.activeSpec !== task) throw new Error(`Execution run must bind to the active task (${active.activeSpec}).`);
  if (!new Set(["PLAN_READY","IMPLEMENTING","VERIFYING","REVIEW_READY","DEPLOY_READY"]).has(active.status)) throw new Error(`Task state ${active.status} is not execution-ready.`);
  const gate = readJson(path.join(repoRoot, "docs/specs", task, "gate.json"));
  if (gate.planApproval?.status !== "approved" || !/^[a-f0-9]{64}$/.test(gate.planApproval?.contractHash ?? "")) throw new Error("Approved plan contract hash is required before starting an execution run.");
  const createdAt = now();
  const run = { schemaVersion:"1.0.0", runId:`RUN-${stamp()}-${random8()}`, lifecycleRef:{kind:"task",id:task,state:active.status}, state:"RUNNING", actorRole:role, approvedPlanDigest:gate.planApproval.contractHash, invariantManifestDigest:sha256File(path.join(repoRoot,"harness/invariants/manifest.json")), pendingOperation:null, completedOperationIds:[], artifactRefs:[`docs/specs/${task}/plan.md`], evidenceRefs:[], approvalRefs:[], resumeCursor:options.resumeCursor ?? "start", idempotencyKey:null, stateVersion:1, integrityHash:"0".repeat(64), stopReason:null, createdAt, updatedAt:createdAt };
  run.integrityHash = computeRunIntegrity(run);
  validateExecutionRun(run);
  const runStore = path.join(repoRoot, ".harness", "runs", task);
  let cursor = repoRoot;
  for (const component of [".harness", "runs", task]) {
    cursor = path.join(cursor, component);
    if (fs.existsSync(cursor)) {
      if (fs.lstatSync(cursor).isSymbolicLink() || !fs.statSync(cursor).isDirectory()) throw new Error(`Unsafe execution run store component: ${path.relative(repoRoot,cursor)}`);
    } else fs.mkdirSync(cursor);
  }
  const file = path.join(runStore, `${run.runId}.json`);
  fs.writeFileSync(file, `${JSON.stringify(run,null,2)}\n`, { flag:"wx" });
  appendEvent(file, eventBase(run,"run-started",role,{artifactRef:`docs/specs/${task}/plan.md`,digest:run.approvedPlanDigest}));
  return { file, run };
}

export function pauseRun(runFile, options = {}, repoRoot = root) {
  return withRunLock(runFile, () => {
  const run = readJson(runFile); assertRunIntegrity(run);
  if (!new Set(["RUNNING","RECOVERING"]).has(run.state)) throw new Error(`Cannot pause run from ${run.state}.`);
  const execution = readJson(path.join(repoRoot,"harness/execution/manifest.json"));
  const reason = (execution.stopReasons ?? []).find((item) => item.id === options.reason);
  if (!reason) throw new Error(`Unknown stop reason: ${options.reason}`);
  run.state = reason.targetState; run.stopReason = reason.id; run.resumeCursor = options.resumeCursor ?? run.resumeCursor; run.stateVersion += 1;
  if (reason.id === "STOP-APPROVAL") {
    if (run.pendingOperation) throw new Error("A pending operation must be completed, reconciled, or aborted before another approval stop.");
    const required = ["operationId","capabilityId","providerId","operation","target","argumentDigest","risk"];
    for (const name of required) if (!options[name]) throw new Error(`STOP-APPROVAL requires --${name.replace(/[A-Z]/g,(m)=>`-${m.toLowerCase()}`)}`);
    if (!/^[a-f0-9]{64}$/.test(options.argumentDigest)) throw new Error("argument digest must be a SHA-256 hex digest");
    const { capabilities } = loadContracts(repoRoot);
    const indexed = capabilityIndex(capabilities).get(`${options.capabilityId}/${options.providerId}/${options.operation}`);
    if (!indexed) throw new Error("Pending operation must reference an existing capability/provider/operation.");
    if (options.risk !== indexed.capability.risk) throw new Error(`Pending operation risk must match canonical capability risk ${indexed.capability.risk}.`);
    if (["external-write","production"].includes(options.risk) && !options.idempotencyKey) throw new Error("Sensitive write approval requires an idempotency key.");
    if (run.completedOperationIds.includes(options.operationId)) throw new Error("Operation ID was already completed in this run and cannot be reused.");
    run.pendingOperation = { operationId:options.operationId, operationRef:{capabilityId:options.capabilityId,providerId:options.providerId,operation:options.operation}, target:options.target, argumentDigest:options.argumentDigest, risk:options.risk, idempotencyKey:options.idempotencyKey ?? null, commitState:options.commitState ?? "not-started" };
    run.idempotencyKey = options.idempotencyKey ?? null;
  }
  if (reason.id === "STOP-CONNECTION" && run.pendingOperation && options.commitState === "ambiguous") run.pendingOperation.commitState = "ambiguous";
  writeRun(runFile,run);
  appendEvent(runFile,eventBase(run,"run-paused",run.actorRole,{operationRef:run.pendingOperation?.operationRef ?? null,operationId:run.pendingOperation?.operationId ?? null,digest:run.pendingOperation?.argumentDigest ?? null}));
  if (run.state === "RECOVERING") appendEvent(runFile,eventBase(run,"recovery-started",run.actorRole,{operationRef:run.pendingOperation?.operationRef ?? null,operationId:run.pendingOperation?.operationId ?? null,digest:run.pendingOperation?.argumentDigest ?? null}));
  return run;
  });
}

export function recordDecision(runFile, options = {}, repoRoot = root) {
  return withRunLock(runFile, () => {
  const run = readJson(runFile); assertRunIntegrity(run);
  if (run.state !== "AWAITING_APPROVAL" || !run.pendingOperation) throw new Error("Operation decision requires a run awaiting approval with a pending operation.");
  if (!/^human:\S+$/.test(options.actor ?? "")) throw new Error("--actor must be human:<name>; agents must not synthesize this value.");
  if (!new Set(["approved","rejected"]).has(options.decision)) throw new Error("--decision must be approved or rejected.");
  if (!options.reason?.trim()) throw new Error("--reason is required.");
  const op=run.pendingOperation;
  const approval={schemaVersion:"1.0.0",approvalId:`OPA-${stamp()}-${random8()}`,runId:run.runId,operationId:op.operationId,operationRef:op.operationRef,target:op.target,argumentDigest:op.argumentDigest,risk:op.risk,decision:options.decision,actor:options.actor,reason:options.reason.trim(),decidedAt:now()};
  validateOperationApproval(approval);
  const dir=path.join(path.dirname(runFile),"approvals"); if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) throw new Error("Approval directory must not be a symbolic link."); fs.mkdirSync(dir,{recursive:true}); const file=path.join(dir,`${approval.approvalId}.json`); fs.writeFileSync(file,`${JSON.stringify(approval,null,2)}\n`,{flag:"wx"});
  run.approvalRefs.push(path.relative(repoRoot,file).replaceAll("\\","/")); run.stateVersion += 1; writeRun(runFile,run);
  appendEvent(runFile,eventBase(run,"approval-recorded","orchestrator",{operationRef:op.operationRef,operationId:op.operationId,artifactRef:path.relative(repoRoot,file).replaceAll("\\","/"),digest:sha256File(file)}));
  return {file,approval};
  });
}

export function resumeRun(runFile, options = {}, repoRoot = root) {
  return withRunLock(runFile, () => {
  const run=readJson(runFile);
  const approval=options.approvalFile?assertLatestOperationApprovalFile(repoRoot,run,options.approvalFile):null;
  validateResume(repoRoot,run,{approval});
  const previous=run.stopReason; run.state="RUNNING"; run.stopReason=null; run.stateVersion += 1;
  writeRun(runFile,run); appendEvent(runFile,eventBase(run,"run-resumed",run.actorRole,{operationRef:run.pendingOperation?.operationRef ?? null,operationId:run.pendingOperation?.operationId ?? null,artifactRef:approval?path.relative(repoRoot,options.approvalFile).replaceAll("\\","/"):null,digest:approval?sha256File(options.approvalFile):null}));
  return {run,previousStopReason:previous};
  });
}


export function authorizeRunOperation(runFile, options = {}, repoRoot = root) {
  return withRunLock(runFile, () => {
  const run=readJson(runFile); assertRunIntegrity(run);
  const approval=options.approvalFile?assertLatestOperationApprovalFile(repoRoot,run,options.approvalFile):null;
  const result=authorizePendingOperation(repoRoot,run,{role:options.role ?? "system-adapter",approval});
  if (result.effect !== "allow") throw new Error(`Operation authorization denied: ${result.reason}; failed=${result.failedConditions.join(",") || "none"}`);
  appendEvent(runFile,eventBase(run,"operation-authorized",options.role ?? "system-adapter",{operationRef:run.pendingOperation.operationRef,operationId:run.pendingOperation.operationId,artifactRef:approval?path.relative(repoRoot,options.approvalFile).replaceAll("\\","/"):null,digest:approval?sha256File(options.approvalFile):run.pendingOperation.argumentDigest}));
  return result;
  });
}

export function completeOperation(runFile, options = {}, repoRoot = root) {
  return withRunLock(runFile, () => {
  const run=readJson(runFile); assertRunIntegrity(run);
  if (run.state !== "RUNNING") throw new Error(`Operation completion requires RUNNING state, got ${run.state}.`);
  if (!run.pendingOperation) throw new Error("Run has no pending operation.");
  if (run.pendingOperation.operationId !== options.operationId) throw new Error("Completed operation ID does not match pending operation.");
  if (!/^[a-f0-9]{64}$/.test(options.resultDigest ?? "")) throw new Error("--result-digest must be a SHA-256 hex digest.");
  if (run.completedOperationIds.includes(options.operationId)) throw new Error("Operation is already recorded as completed; irreversible operations must not repeat.");
  const events = readEvents(runFile);
  const authorized = [...events].reverse().find((event) => event.type === "operation-authorized" && event.operationId === options.operationId);
  if (!authorized) throw new Error("Pending operation has no recorded successful authorization check.");
  const reconciled = [...events].reverse().find((event) => event.type === "recovery-reconciled" && event.operationId === options.operationId);
  if (reconciled && authorized.sequence < reconciled.sequence) throw new Error("Operation must be re-authorized after reconciliation before retry completion.");
  if (authorized.artifactRef) {
    const approvalPath = resolveRunArtifact(repoRoot, authorized.artifactRef, "Authorized operation approval").absolute;
    if (sha256File(approvalPath) !== authorized.digest) throw new Error("Operation approval changed after authorization; re-authorization is required.");
    assertLatestOperationApprovalFile(repoRoot,run,approvalPath);
  } else if (authorized.digest !== run.pendingOperation.argumentDigest) throw new Error("Authorization event is not bound to the current operation digest.");
  const ref=run.pendingOperation.operationRef;
  run.pendingOperation.commitState="confirmed";
  run.completedOperationIds.push(options.operationId);
  run.pendingOperation=null; run.idempotencyKey=null; run.stateVersion += 1;
  writeRun(runFile,run);
  appendEvent(runFile,eventBase(run,"operation-completed",run.actorRole,{operationRef:ref,operationId:options.operationId,digest:options.resultDigest}));
  return run;
  });
}

export function reconcileRunOperation(runFile, options = {}, repoRoot = root) {
  return withRunLock(runFile, () => {
    const run=readJson(runFile); assertRunIntegrity(run);
    if (run.state !== "RECOVERING") throw new Error(`Reconciliation requires RECOVERING state, got ${run.state}.`);
    if (!run.pendingOperation || run.pendingOperation.commitState !== "ambiguous") throw new Error("Reconciliation requires an ambiguous pending operation.");
    if (!new Set(["applied","not-applied"]).has(options.resolution)) throw new Error("--resolution must be applied or not-applied.");
    const evidence=resolveRepositoryFile(repoRoot,options.evidence,"Reconciliation evidence");
    if (!evidence.path.startsWith(".harness/reports/")) throw new Error("Reconciliation evidence must be stored under .harness/reports/.");
    const digest=sha256File(evidence.absolute);
    const operation=structuredClone(run.pendingOperation);
    if (options.resolution === "applied") {
      if (run.completedOperationIds.includes(operation.operationId)) throw new Error("Ambiguous operation is already recorded as completed.");
      run.completedOperationIds.push(operation.operationId);
      run.pendingOperation=null; run.idempotencyKey=null;
    } else run.pendingOperation.commitState="not-started";
    run.state="PAUSED"; run.stateVersion += 1;
    writeRun(runFile,run);
    appendEvent(runFile,eventBase(run,"recovery-reconciled",options.actorRole ?? "system-adapter",{operationRef:operation.operationRef,operationId:operation.operationId,artifactRef:evidence.path,digest}));
    if (options.resolution === "applied") appendEvent(runFile,eventBase(run,"operation-completed",options.actorRole ?? "system-adapter",{operationRef:operation.operationRef,operationId:operation.operationId,artifactRef:evidence.path,digest}));
    return run;
  });
}

export function finishRun(runFile, options = {}, repoRoot = root) {
  return withRunLock(runFile, () => {
  const run=readJson(runFile); assertRunIntegrity(run);
  const target=({succeeded:"SUCCEEDED",failed:"FAILED",cancelled:"ABORTED"})[options.result];
  if (!target) throw new Error("--result must be succeeded, failed, or cancelled.");
  if (!new Set(["RUNNING","PAUSED","AWAITING_APPROVAL","RECOVERING"]).has(run.state)) throw new Error(`Cannot finish run from ${run.state}.`);
  if (target === "SUCCEEDED" && run.state !== "RUNNING") throw new Error("A successful run may finish only from RUNNING state.");
  if (target === "SUCCEEDED" && run.pendingOperation) throw new Error("Cannot succeed a run while an operation is still pending.");
  run.state=target; if (target === "SUCCEEDED") run.stopReason=null; run.stateVersion += 1; writeRun(runFile,run); appendEvent(runFile,eventBase(run,"run-finished",run.actorRole)); return run;
  });
}

function main() {
  const [command] = process.argv.slice(2);
  try {
    if (command === "start") {
      const result=startRun(root,{task:arg("--task"),role:arg("--role") ?? "implementer",resumeCursor:arg("--resume-cursor")}); console.log(JSON.stringify({runPath:relative(result.file),runId:result.run.runId,state:result.run.state},null,2)); return;
    }
    const runFile=ensureInsideRunStore(arg("--run") ?? "");
    if (command === "pause") {
      const result=pauseRun(runFile,{reason:arg("--reason"),resumeCursor:arg("--resume-cursor"),operationId:arg("--operation-id"),capabilityId:arg("--capability"),providerId:arg("--provider"),operation:arg("--operation"),target:arg("--target"),argumentDigest:arg("--argument-digest"),risk:arg("--risk"),idempotencyKey:arg("--idempotency-key"),commitState:arg("--commit-state")}); console.log(JSON.stringify({runPath:relative(runFile),state:result.state,stopReason:result.stopReason},null,2)); return;
    }
    if (command === "decision") {
      const result=recordDecision(runFile,{decision:arg("--decision"),actor:arg("--actor"),reason:arg("--reason")}); console.log(JSON.stringify({approvalPath:relative(result.file),decision:result.approval.decision},null,2)); return;
    }
    if (command === "resume") {
      const approval=arg("--approval"); const approvalFile=approval?ensureApprovalForRun(runFile,approval):null; const result=resumeRun(runFile,{approvalFile}); console.log(JSON.stringify({runPath:relative(runFile),state:result.run.state,previousStopReason:result.previousStopReason},null,2)); return;
    }
    if (command === "authorize") { const approval=arg("--approval"); const approvalFile=approval?ensureApprovalForRun(runFile,approval):null; const result=authorizeRunOperation(runFile,{role:arg("--role") ?? "system-adapter",approvalFile}); console.log(JSON.stringify({runPath:relative(runFile),effect:result.effect,matchedPolicyId:result.matchedPolicyId,conditions:result.conditions},null,2)); return; }
    if (command === "reconcile") { const result=reconcileRunOperation(runFile,{resolution:arg("--resolution"),evidence:arg("--evidence"),actorRole:arg("--role") ?? "system-adapter"}); console.log(JSON.stringify({runPath:relative(runFile),state:result.state,resolution:arg("--resolution"),completedOperationIds:result.completedOperationIds},null,2)); return; }
    if (command === "operation-complete") { const result=completeOperation(runFile,{operationId:arg("--operation-id"),resultDigest:arg("--result-digest")}); console.log(JSON.stringify({runPath:relative(runFile),state:result.state,completedOperationIds:result.completedOperationIds},null,2)); return; }
    if (command === "finish") { const result=finishRun(runFile,{result:arg("--result")}); console.log(JSON.stringify({runPath:relative(runFile),state:result.state},null,2)); return; }
    throw new Error("Usage: execution-run.mjs <start|pause|decision|resume|authorize|reconcile|operation-complete|finish> ...");
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
