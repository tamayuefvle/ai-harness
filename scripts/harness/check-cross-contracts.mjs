import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { capabilityIndex, loadContracts } from "./execution-lib.mjs";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function validateCrossContracts(root = repoRoot) {
  const { lifecycle, capabilities, invariants, execution, authorization } = loadContracts(root);
  const errors = [];
  const lifecycleNames = Object.keys(lifecycle.lifecycles ?? {}).sort();
  const expected = ["incident", "project", "release", "task"];
  if (JSON.stringify(lifecycleNames) !== JSON.stringify(expected)) errors.push(`SDLC lifecycle ownership changed: ${lifecycleNames.join(",")}`);
  const bindings = [...(execution.lifecycleOwnership?.bindings ?? [])].sort();
  if (JSON.stringify(bindings) !== JSON.stringify(["task"]) || execution.lifecycleOwnership?.ownsLifecycleTransitions !== false) errors.push("v13 execution runs must bind only to Task and must never own SDLC lifecycle transitions.");

  const lifecycleStates = new Set(Object.values(lifecycle.lifecycles ?? {}).flatMap((item) => [item.initialState, ...(item.activeStates ?? []), ...(item.terminalStates ?? [])]));
  for (const state of [...(execution.runStates?.active ?? []), ...(execution.runStates?.terminal ?? [])]) if (lifecycleStates.has(state)) errors.push(`Run state collides with lifecycle state: ${state}`);

  const invariantIds = new Set((invariants.invariants ?? []).map((item) => item.id));
  for (const id of ["INV-AUTHORITY-INTEGRITY", "INV-APPROVAL-INTEGRITY", "INV-EVIDENCE-INTEGRITY", "INV-EXTERNAL-WRITE", "INV-SECRET-BOUNDARY"]) if (!invariantIds.has(id)) errors.push(`Required invariant missing: ${id}`);
  if (invariantIds.size !== (invariants.invariants ?? []).length) errors.push("Invariant IDs must be unique.");

  const capIndex = capabilityIndex(capabilities);
  for (const [condition, definition] of Object.entries(authorization.conditionDefinitions ?? {})) if (definition.selfAssertable !== false || !definition.evidenceSource) errors.push(`Authorization condition must be evidence-derived, not self-asserted: ${condition}`);
  const policyIds = new Set();
  for (const policy of authorization.policies ?? []) {
    if (policyIds.has(policy.id)) errors.push(`Duplicate authorization policy: ${policy.id}`);
    policyIds.add(policy.id);
    for (const condition of policy.conditions ?? []) if (!authorization.conditionDefinitions?.[condition]) errors.push(`Authorization policy ${policy.id} references undefined condition: ${condition}`);
    for (const operation of policy.operations ?? []) {
      const key = `${policy.capabilityId}/${policy.providerId}/${operation}`;
      const indexed = capIndex.get(key);
      if (!indexed) { errors.push(`Authorization references unknown capability operation: ${key}`); continue; }
      const readOnlyGrant = (policy.conditions ?? []).includes("read-only");
      if (policy.effect === "allow" && ["external-write", "production"].includes(indexed.capability.risk) && !readOnlyGrant) {
        for (const condition of ["operation-approval-required", "approved-digest-match", "idempotency-key-required"]) if (!(policy.conditions ?? []).includes(condition)) errors.push(`Sensitive allow ${policy.id} missing ${condition}`);
      }
      if (["implementer", "verifier", "reviewer"].includes(policy.role) && policy.effect === "allow" && ["external-write", "production"].includes(indexed.capability.risk) && !readOnlyGrant) errors.push(`${policy.role} must not directly receive sensitive external authority (${policy.id}).`);
      if (["verifier", "reviewer"].includes(policy.role) && policy.effect === "allow" && operation === "write-approved-paths") errors.push(`${policy.role} must remain read-only (${policy.id}).`);
    }
  }

  const allowedRefs = new Set((authorization.policies ?? []).filter((policy) => policy.effect === "allow").flatMap((policy) => policy.operations.map((operation) => `${policy.capabilityId}/${policy.providerId}/${operation}`)));
  for (const capability of capabilities.capabilities ?? []) for (const provider of capability.providers ?? []) if (provider.enabledByDefault) for (const operation of provider.operations ?? []) {
    const ref = `${capability.id}/${provider.id}/${operation}`;
    if (!allowedRefs.has(ref)) errors.push(`Enabled capability operation has no authorized role: ${ref}`);
  }

  if (execution.retry?.nonIdempotentWrite?.blindRetry !== false || execution.retry?.nonIdempotentWrite?.maxAttempts !== 1) errors.push("Non-idempotent write retry must fail closed.");
  if (execution.retry?.ambiguousExternalWrite?.blindRetry !== false || execution.retry?.ambiguousExternalWrite?.requiredAction !== "reconcile-before-retry") errors.push("Ambiguous external write must require reconciliation before retry.");
  const invariantStop = (execution.stopReasons ?? []).find((item) => item.id === "STOP-INVARIANT");
  if (!invariantStop || invariantStop.resumable !== false || execution.resume?.invariantStopRequiresNewRun !== true) errors.push("Invariant violation must require a new run, not in-place resume.");
  if (execution.checkpoint?.chatMemoryAuthoritative !== false) errors.push("Chat memory must not be authoritative resume state.");


  const fallback = JSON.parse(fs.readFileSync(path.join(root, "harness/fallback/manifest.json"), "utf8"));
  if (JSON.stringify(fallback?.primaryExecutor) !== JSON.stringify("cursor") || fallback?.secondaryExecutor !== "codex-cli" || fallback?.terminalFallback !== "human") errors.push("Executor fallback order must remain Cursor -> Codex CLI -> Human.");
  if (fallback?.diagnostic?.sandbox !== "read-only" || fallback?.diagnostic?.freshSession !== true || fallback?.diagnostic?.implementationBeforeDecision !== false) errors.push("Codex fallback diagnosis must be fresh, read-only, and precede implementation.");
  if (fallback?.secondaryImplementation?.reuseRole !== "implementer" || fallback?.secondaryImplementation?.maxBoundedStrategies !== 1 || fallback?.secondaryImplementation?.requireMateriallyDifferentStrategy !== true) errors.push("Fallback must reuse the existing Codex implementer for only one materially different bounded strategy.");
  if (fallback?.review?.reuseRole !== "reviewer" || fallback?.review?.sandbox !== "read-only" || fallback?.review?.freshSession !== true || fallback?.review?.mustNotReuseImplementationContext !== true) errors.push("Codex reviewer independence must remain fresh and read-only after fallback implementation.");
  if (fallback?.loopPolicy?.cursorToCodexToCursorAutomaticLoop !== false || fallback?.loopPolicy?.codexRetryWithNewSessionAutomaticLoop !== false) errors.push("Automatic executor fallback loops are forbidden.");
  if (execution.fallbackPolicy?.manifest !== "harness/fallback/manifest.json") errors.push("Execution manifest must reference the canonical fallback manifest instead of redefining fallback policy.");
  if (!Array.isArray(fallback?.humanFirstReasons) || fallback.humanFirstReasons.length === 0) errors.push("Fallback manifest must own human-first reasons.");
  if (JSON.stringify(fallback?.primaryTransports) !== JSON.stringify(["cursor-ide","cursor-cli"]) || fallback?.transportSwitchConsumesNewStrategyBudget !== false || fallback?.cursorCliManifest !== "harness/cursor/manifest.json") errors.push("Cursor IDE and Cursor CLI must remain transports of one logical Cursor executor and share one bounded strategy budget.");
  for (const id of ["STOP-HUMAN-ACTION","STOP-HUMAN-DECISION","STOP-RETRY-BUDGET"]) if (!(execution.stopReasons ?? []).some((x)=>x.id===id && x.targetState==="PAUSED")) errors.push(`Missing fallback stop reason: ${id}`);
  const skill = fs.readFileSync(path.join(root, ".cursor/skills/executor-fallback/SKILL.md"), "utf8");
  if (!skill.includes("GENERATED FILE. DO NOT EDIT DIRECTLY") || !skill.includes("ai:fallback-diagnose")) errors.push("Cursor fallback Skill is missing or not generated from the canonical source.");

  return errors;
}

function main() {
  const errors = validateCrossContracts();
  if (errors.length) {
    for (const error of errors) console.error(`[FAIL] ${error}`);
    process.exit(1);
  }
  console.log("[PASS] Execution Safety Kernel cross-contracts are coherent: one SDLC lifecycle owner, capability-referenced authorization, separated approvals, and fail-closed retry/recovery and bounded Cursor-to-Codex-to-Human fallback semantics.");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
