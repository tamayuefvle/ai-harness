import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertTaskId } from "./task-id.mjs";

const canonicalRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const SCHEMAS = {
  gate: "harness/schemas/lifecycle-gate.schema.json",
  implementation: "harness/schemas/implementation.schema.json",
  verification: "harness/schemas/verification.schema.json",
  githubContext: "harness/schemas/github-context.schema.json",
  reactDoctor: "harness/schemas/react-doctor-result.schema.json",
  review: "harness/schemas/review.schema.json",
  executionRun: "harness/schemas/execution-run.schema.json",
  operationApproval: "harness/schemas/operation-approval.schema.json",
  diagnosticEvidence: "harness/schemas/diagnostic-evidence.schema.json",
  fallbackHandoff: "harness/schemas/fallback-handoff.schema.json",
  fallbackDecision: "harness/schemas/fallback-decision.schema.json",
  runtimeEvent: "harness/schemas/runtime-event.schema.json",
};

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolveRef(rootSchema, ref) {
  if (!ref.startsWith("#/")) throw new Error(`Only local JSON Schema references are supported: ${ref}`);
  return ref.slice(2).split("/").reduce((value, token) => value[token.replaceAll("~1", "/").replaceAll("~0", "~")], rootSchema);
}

function validateNode(value, schema, rootSchema, location, errors) {
  if (!schema || typeof schema !== "object") return;
  if (schema.$ref) {
    validateNode(value, resolveRef(rootSchema, schema.$ref), rootSchema, location, errors);
    return;
  }
  for (const branch of schema.allOf ?? []) validateNode(value, branch, rootSchema, location, errors);
  if (schema.if) {
    const probe = [];
    validateNode(value, schema.if, rootSchema, location, probe);
    if (probe.length === 0 && schema.then) validateNode(value, schema.then, rootSchema, location, errors);
    if (probe.length > 0 && schema.else) validateNode(value, schema.else, rootSchema, location, errors);
  }
  if (Object.hasOwn(schema, "const") && !sameJson(value, schema.const)) errors.push(`${location} must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((item) => sameJson(item, value))) errors.push(`${location} must be one of ${schema.enum.map(JSON.stringify).join(", ")}`);

  const types = schema.type === undefined ? null : (Array.isArray(schema.type) ? schema.type : [schema.type]);
  if (types && !types.some((type) => typeMatches(value, type))) {
    errors.push(`${location} must have type ${types.join(" or ")}`);
    return;
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${location} is shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${location} is longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${location} does not match ${schema.pattern}`);
    if (schema.format === "date-time" && (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value)))) errors.push(`${location} is not a valid date-time`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${location} must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${location} must be <= ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${location} must contain at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${location} must contain at most ${schema.maxItems} items`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${location} must contain unique items`);
    if (schema.items) value.forEach((item, index) => validateNode(item, schema.items, rootSchema, `${location}[${index}]`, errors));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) errors.push(`${location}.${key} is required`);
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) validateNode(value[key], child, rootSchema, `${location}.${key}`, errors);
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${location}.${key} is not allowed`);
    }
  }
}

export function validateAgainstSchema(value, schema, label = "artifact") {
  const errors = [];
  validateNode(value, schema, schema, "$", errors);
  if (errors.length) throw new Error(`${label} failed JSON Schema validation: ${errors.slice(0, 12).join("; ")}`);
  return value;
}

export function schemaFor(kind) {
  const relative = SCHEMAS[kind];
  if (!relative) throw new Error(`Unknown artifact schema: ${kind}`);
  return JSON.parse(fs.readFileSync(path.join(canonicalRoot, relative), "utf8"));
}

export function parseJsonArtifact(absolutePath, kind, label = kind) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  return validateAgainstSchema(value, schemaFor(kind), label);
}

export function validateGate(gate) {
  return validateAgainstSchema(gate, schemaFor("gate"), "Lifecycle gate");
}

export function validateImplementationArtifact(absolutePath, taskId) {
  const report = parseJsonArtifact(absolutePath, "implementation", "Implementation report");
  assertTaskId(report.task_id, "Implementation report task_id");
  if (report.task_id !== taskId) throw new Error(`Implementation report task_id mismatch: ${report.task_id} != ${taskId}`);
  const discipline = report.test_discipline;
  const hasText = (value) => typeof value === "string" && value.trim().length > 0;
  if (discipline.applicable) {
    if (!hasText(discipline.red_evidence)) throw new Error("Applicable TDD requires non-empty red_evidence.");
    if (!hasText(discipline.green_evidence)) throw new Error("Applicable TDD requires non-empty green_evidence.");
    if (discipline.refactor === "not-applicable" || discipline.not_applicable_reason !== null) throw new Error("Applicable TDD fields are inconsistent.");
  } else {
    if (discipline.red_evidence !== null || discipline.green_evidence !== null || discipline.refactor !== "not-applicable" || !hasText(discipline.not_applicable_reason)) {
      throw new Error("Non-applicable TDD requires null red_evidence/green_evidence, refactor=not-applicable, and a non-empty not_applicable_reason.");
    }
  }
  const passed = report.status === "implemented" && report.commands_run.length > 0 && report.commands_run.every((item) => item.result === "pass") && report.remaining_work.length === 0 && report.scope_deviations.length === 0;
  return { report, status: passed ? "passed" : "failed" };
}

export function validateVerificationArtifact(absolutePath, taskId) {
  const report = parseJsonArtifact(absolutePath, "verification", "Verification report");
  if (report.taskId !== taskId) throw new Error(`Verification report taskId mismatch: ${report.taskId} != ${taskId}`);
  const checksPass = report.checks.length > 0 && report.checks.every((item) => item.status === "passed" || item.status === "skipped");
  if (report.preview.status === "skipped" && !report.preview.reason?.trim()) throw new Error("Skipped preview verification requires a reason.");
  const semanticallyPassed = checksPass && report.rollback.confirmed === true;
  if ((report.status === "passed") !== semanticallyPassed) throw new Error("Verification report status conflicts with checks or rollback evidence.");
  return { report, status: semanticallyPassed ? "passed" : "failed", previewStatus: report.preview.status, rollbackConfirmed: report.rollback.confirmed, headSha: report.headSha };
}

export function validateGitHubContextArtifact(absolutePath, taskId, expectedHead, { requirePassing = true } = {}) {
  const report = parseJsonArtifact(absolutePath, "githubContext", "GitHub context");
  if (report.taskId !== taskId) throw new Error(`GitHub context taskId mismatch: ${report.taskId} != ${taskId}`);
  if (expectedHead && report.source.headSha !== expectedHead) throw new Error("GitHub context HEAD does not match verification HEAD.");
  const blocked = report.requiredChecks.filter((check) => check.bucket !== "pass" && check.bucket !== "skipping");
  const passing = report.status === "complete" && report.pullRequest !== null && report.pullRequest.headRefOid === expectedHead && report.requiredChecks.length > 0 && blocked.length === 0 && report.errors.length === 0;
  if (requirePassing && !passing) {
    throw new Error(`GitHub context is not release-ready (status=${report.status}, pullRequest=${report.pullRequest ? "present" : "missing"}, blockedChecks=${blocked.map((item) => item.name).join(",") || "none"}).`);
  }
  return { report, status: passing ? "passed" : "failed" };
}

export function validateReactDoctorArtifact(absolutePath, taskId, expectedHead, { requirePassing = true } = {}) {
  const report = parseJsonArtifact(absolutePath, "reactDoctor", "React Doctor report");
  if (report.run.active_spec !== taskId) throw new Error(`React Doctor active_spec mismatch: ${report.run.active_spec} != ${taskId}`);
  if (expectedHead && report.run.git_head !== expectedHead) throw new Error("React Doctor HEAD does not match verification HEAD.");
  const warningCompatible = report.run.blocking !== "warning" || report.result.counts.warnings === 0;
  const schemaCompatible = [1, 3].includes(report.result.raw_contract.schema_version);
  const passing = report.result.status === "passed" && report.result.exit_code === 0 && report.result.counts.errors === 0 && warningCompatible && report.tool.version === report.tool.expected_version && schemaCompatible && report.result.raw_contract.react_detected === true && report.result.raw_contract.project_count > 0 && report.result.raw_contract.baseline_degraded !== true && report.result.raw_contract.incomplete_project_count === 0;
  if (requirePassing && !passing) throw new Error(`React Doctor report is not passing (status=${report.result.status}).`);
  return { report, status: passing ? "passed" : "failed" };
}

export function validateReviewArtifact(absolutePath, taskId, expectedHead) {
  const report = parseJsonArtifact(absolutePath, "review", "Review report");
  if (report.task_id !== taskId) throw new Error(`Review report task_id mismatch: ${report.task_id} != ${taskId}`);
  if (expectedHead && report.head_sha !== expectedHead) throw new Error("Review report HEAD does not match verified HEAD.");
  const counts = { p0: 0, p1: 0, p2: 0, p3: 0 };
  for (const finding of report.findings) counts[finding.severity.toLowerCase()] += 1;
  const diagnosticsPass = report.diagnostic_evidence.every((item) => item.reviewed && ["passed", "complete", "skipped"].includes(item.status));
  const approvable = report.verdict === "approved" && counts.p0 === 0 && counts.p1 === 0 && report.unverified_areas.length === 0 && diagnosticsPass;
  if (report.verdict === "approved" && !approvable) throw new Error("Approved review conflicts with blocking findings, unverified areas, or diagnostic evidence.");
  return { report, verdict: report.verdict, ...counts };
}
