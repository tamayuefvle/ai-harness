import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { schemaFor, validateAgainstSchema } from "./artifact-validator.mjs";
import { parseAllowedPaths, designDocumentPath } from "./lifecycle-gates.mjs";

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function computeRunIntegrity(run) {
  const clone = structuredClone(run);
  delete clone.integrityHash;
  return sha256Text(stableJson(clone));
}

export function assertRunIntegrity(run) {
  validateExecutionRun(run);
  const actual = computeRunIntegrity(run);
  if (actual !== run.integrityHash) throw new Error(`Execution run integrity mismatch: expected ${run.integrityHash}, computed ${actual}`);
  return true;
}

export function loadContracts(repoRoot) {
  return {
    lifecycle: readJson(path.join(repoRoot, "harness/lifecycle/manifest.json")),
    capabilities: readJson(path.join(repoRoot, "harness/capabilities/manifest.json")),
    invariants: readJson(path.join(repoRoot, "harness/invariants/manifest.json")),
    execution: readJson(path.join(repoRoot, "harness/execution/manifest.json")),
    authorization: readJson(path.join(repoRoot, "harness/authorization/manifest.json")),
  };
}


export function resolveRunArtifact(repoRoot, input, label = "Run artifact") {
  if (!input || typeof input !== "string" || path.isAbsolute(input)) throw new Error(`${label} must be a repository-relative path under .harness/runs/.`);
  const normalized = input.replaceAll("\\", "/").replace(/^\.\//, "");
  const absolute = path.resolve(repoRoot, normalized);
  const store = path.resolve(repoRoot, ".harness/runs");
  const insideStore = path.relative(store, absolute);
  if (!insideStore || insideStore.startsWith(`..${path.sep}`) || path.isAbsolute(insideStore)) throw new Error(`${label} must remain under .harness/runs/.`);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`${label} does not exist: ${normalized}`);
  const relative = path.relative(repoRoot, absolute).replaceAll("\\", "/");
  let cursor = repoRoot;
  for (const component of relative.split("/")) {
    cursor = path.join(cursor, component);
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error(`${label} cannot traverse a symbolic link: ${relative}`);
  }
  const realRoot = fs.realpathSync(repoRoot);
  const realFile = fs.realpathSync(absolute);
  const realRelative = path.relative(realRoot, realFile);
  if (!realRelative || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) throw new Error(`${label} resolves outside the repository: ${relative}`);
  return { relative, absolute };
}

export function validateExecutionRun(run) {
  return validateAgainstSchema(run, schemaFor("executionRun"), "Execution run");
}

export function validateOperationApproval(approval) {
  return validateAgainstSchema(approval, schemaFor("operationApproval"), "Operation approval");
}

export function validateRuntimeEvent(event) {
  return validateAgainstSchema(event, schemaFor("runtimeEvent"), "Runtime event");
}

export function capabilityIndex(capabilities) {
  const index = new Map();
  for (const capability of capabilities.capabilities ?? []) {
    for (const provider of capability.providers ?? []) {
      for (const operation of provider.operations ?? []) {
        index.set(`${capability.id}/${provider.id}/${operation}`, { capability, provider, operation });
      }
    }
  }
  return index;
}

export function authorizeOperation(authorization, capabilities, request) {
  const ref = `${request.capabilityId}/${request.providerId}/${request.operation}`;
  const cap = capabilityIndex(capabilities).get(ref);
  if (!cap) return { effect: "deny", matchedPolicyId: null, failedConditions: [], reason: `unknown capability operation: ${ref}` };
  const matching = (authorization.policies ?? []).filter((policy) => policy.role === request.role && policy.capabilityId === request.capabilityId && policy.providerId === request.providerId && policy.operations.includes(request.operation));
  const explicitDeny = matching.find((policy) => policy.effect === "deny");
  if (explicitDeny) return { effect: "deny", matchedPolicyId: explicitDeny.id, failedConditions: [], reason: "explicit deny" };
  const provided = new Set(request.conditions ?? []);
  for (const policy of matching.filter((item) => item.effect === "allow")) {
    const failed = (policy.conditions ?? []).filter((condition) => !provided.has(condition));
    if (!failed.length) return { effect: "allow", matchedPolicyId: policy.id, failedConditions: [], reason: "matching allow with all conditions" };
  }
  const required = [...new Set(matching.filter((item) => item.effect === "allow").flatMap((item) => item.conditions ?? []))];
  return { effect: "deny", matchedPolicyId: null, failedConditions: required.filter((condition) => !provided.has(condition)), reason: "default deny" };
}

export function classifyRetry(execution, { readOnly = false, idempotent = false, ambiguous = false } = {}) {
  if (ambiguous) return { allowed: false, action: execution.retry.ambiguousExternalWrite.requiredAction, maxAttempts: 1 };
  if (readOnly) return { allowed: true, action: "bounded-retry", maxAttempts: execution.retry.readOnly.maxAttempts };
  if (idempotent) return { allowed: true, action: "same-key-retry", maxAttempts: execution.retry.idempotentWrite.maxAttempts };
  return { allowed: false, action: "no-blind-retry", maxAttempts: execution.retry.nonIdempotentWrite.maxAttempts };
}

export function assertOperationApproval(run, approval) {
  validateOperationApproval(approval);
  if (!run.pendingOperation) throw new Error("Run has no pending operation to approve.");
  if (approval.runId !== run.runId || approval.operationId !== run.pendingOperation.operationId) throw new Error("Operation approval is bound to a different run or operation.");
  const expected = run.pendingOperation;
  const sameRef = ["capabilityId", "providerId", "operation"].every((key) => approval.operationRef?.[key] === expected.operationRef?.[key]);
  if (!sameRef || approval.target !== expected.target || approval.argumentDigest !== expected.argumentDigest) throw new Error("Operation approval target/digest binding does not match the pending operation.");
  if (approval.decision !== "approved") throw new Error(`Operation approval decision is ${approval.decision}, not approved.`);
  if (!/^human:\S+$/.test(approval.actor ?? "")) throw new Error("Operation approval must be recorded by a human actor.");
  return true;
}

export function parseActiveTask(repoRoot) {
  const activePath = path.join(repoRoot, "docs/specs/_active.md");
  const text = fs.readFileSync(activePath, "utf8");
  return {
    activeSpec: text.match(/active_spec:\s*(\S+)/)?.[1] ?? "none",
    status: text.match(/status:\s*(\S+)/)?.[1] ?? "UNKNOWN",
  };
}

export function assertCurrentLifecycleBinding(repoRoot, run) {
  if (run.lifecycleRef.kind === "task") {
    const active = parseActiveTask(repoRoot);
    if (active.activeSpec !== run.lifecycleRef.id || active.status !== run.lifecycleRef.state) throw new Error(`Lifecycle state changed since checkpoint: ${run.lifecycleRef.id}/${run.lifecycleRef.state} -> ${active.activeSpec}/${active.status}`);
    const gate = readJson(path.join(repoRoot, "docs/specs", run.lifecycleRef.id, "gate.json"));
    if (gate.designApproval?.status !== "approved" || gate.designApproval.contractHash !== run.approvedDesignDigest) throw new Error("Approved design digest is stale or no longer approved.");
    return true;
  }
  throw new Error(`Runtime CLI does not yet derive canonical approval binding for lifecycle kind ${run.lifecycleRef.kind}.`);
}

export function targetWithinApprovedScope(target, allowedPaths, taskId) {
  const normalized = String(target ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.split("/").includes("..") || path.isAbsolute(normalized)) return false;
  const lifecycleAllow = [
    `docs/specs/${taskId}/`,
    `.harness/reports/${taskId}/`,
    `.harness/runs/${taskId}/`,
  ];
  if (lifecycleAllow.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))) return true;
  return (allowedPaths ?? []).some((allowed) => {
    const base = String(allowed).replaceAll("\\", "/").replace(/\/$/, "");
    return normalized === base || normalized.startsWith(`${base}/`);
  });
}

export function deriveScopeConditions(repoRoot, run) {
  const target = run.pendingOperation?.target ?? "";
  const isExternalTarget = /^[a-z][a-z0-9+.-]*:/i.test(target);
  if (isExternalTarget) return ["work-scope-match"];
  const planFile = designDocumentPath(repoRoot, run.lifecycleRef.id);
  if (!fs.existsSync(planFile) || fs.lstatSync(planFile).isSymbolicLink()) throw new Error("Approved design document is required to derive work-scope evidence.");
  const allowed = parseAllowedPaths(fs.readFileSync(planFile, "utf8"));
  if (!targetWithinApprovedScope(target, allowed, run.lifecycleRef.id)) {
    throw new Error(`Pending operation target is outside approved design scope: ${target}`);
  }
  return ["work-scope-match", "approved-path-match"];
}

export function authorizePendingOperation(repoRoot, run, { role = "system-adapter", approval = null } = {}) {
  assertRunIntegrity(run);
  if (run.state !== "RUNNING") throw new Error(`Pending operation authorization requires RUNNING state, got ${run.state}.`);
  if (!run.pendingOperation) throw new Error("Run has no pending operation to authorize.");
  assertCurrentLifecycleBinding(repoRoot, run);
  const { authorization, capabilities } = loadContracts(repoRoot);
  const indexed = capabilityIndex(capabilities).get(`${run.pendingOperation.operationRef.capabilityId}/${run.pendingOperation.operationRef.providerId}/${run.pendingOperation.operationRef.operation}`);
  if (!indexed) throw new Error("Pending operation references an unknown capability operation.");
  const conditions = [...deriveScopeConditions(repoRoot, run)];
  if (indexed.provider.enabledByDefault) conditions.push("provider-enabled");
  if (approval) { assertOperationApproval(run, approval); conditions.push("operation-approval-required", "approved-digest-match"); }
  if (run.pendingOperation.idempotencyKey) conditions.push("idempotency-key-required");
  const result = authorizeOperation(authorization, capabilities, { role, ...run.pendingOperation.operationRef, conditions });
  return { ...result, conditions, capabilityRisk: indexed.capability.risk };
}

export function latestOperationApproval(repoRoot, run) {
  if (!run.pendingOperation) throw new Error("Run has no pending operation.");
  let latest = null;
  for (const ref of run.approvalRefs ?? []) {
    const resolved = resolveRunArtifact(repoRoot, ref, "Operation approval reference");
    const approval = readJson(resolved.absolute);
    validateOperationApproval(approval);
    if (approval.runId === run.runId && approval.operationId === run.pendingOperation.operationId) latest = { ref: resolved.relative, file: resolved.absolute, approval };
  }
  return latest;
}

export function assertLatestOperationApprovalFile(repoRoot, run, approvalFile) {
  const latest = latestOperationApproval(repoRoot, run);
  if (!latest) throw new Error("No operation approval decision is recorded for the pending operation.");
  const actual = fs.realpathSync(approvalFile);
  if (actual !== fs.realpathSync(latest.file)) throw new Error("Selected operation approval is superseded by a later decision.");
  assertOperationApproval(run, latest.approval);
  return latest.approval;
}

export function validateResume(repoRoot, run, { approval = null } = {}) {
  assertRunIntegrity(run);
  const execution = readJson(path.join(repoRoot, "harness/execution/manifest.json"));
  const stop = (execution.stopReasons ?? []).find((item) => item.id === run.stopReason);
  if (!stop) throw new Error(`Unknown or missing stop reason: ${run.stopReason}`);
  if (!stop.resumable) throw new Error(`${run.stopReason} cannot be resumed in place; start a new run from canonical state.`);
  if (!new Set(["PAUSED", "AWAITING_APPROVAL", "RECOVERING"]).has(run.state)) throw new Error(`Run state ${run.state} is not resumable.`);

  assertCurrentLifecycleBinding(repoRoot, run);

  const currentInvariantDigest = sha256File(path.join(repoRoot, "harness/invariants/manifest.json"));
  if (currentInvariantDigest !== run.invariantManifestDigest) throw new Error("Invariant manifest changed since checkpoint; start a new run after review.");
  if (run.state === "AWAITING_APPROVAL" || run.stopReason === "STOP-APPROVAL") assertOperationApproval(run, approval);
  if (run.pendingOperation?.commitState === "ambiguous") throw new Error("Ambiguous external write must be reconciled with recorded evidence before resume.");
  return true;
}

export function readEvents(runFile) {
  const eventsPath = path.join(path.dirname(runFile), `${path.basename(runFile, ".json")}.events.jsonl`);
  if (!fs.existsSync(eventsPath)) return [];
  return fs.readFileSync(eventsPath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

export function nextEventSequence(eventsPath) {
  if (!fs.existsSync(eventsPath)) return 1;
  const lines = fs.readFileSync(eventsPath, "utf8").split(/\r?\n/).filter(Boolean);
  return lines.length + 1;
}

export function appendEvent(runFile, event) {
  const eventsPath = path.join(path.dirname(runFile), `${path.basename(runFile, ".json")}.events.jsonl`);
  if (fs.existsSync(eventsPath) && fs.lstatSync(eventsPath).isSymbolicLink()) throw new Error("Runtime event log must not be a symbolic link.");
  const finalEvent = { ...event, sequence: nextEventSequence(eventsPath) };
  validateRuntimeEvent(finalEvent);
  fs.appendFileSync(eventsPath, `${JSON.stringify(finalEvent)}\n`, "utf8");
  return eventsPath;
}
