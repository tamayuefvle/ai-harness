import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateImplementationReport } from "./lifecycle-gates.mjs";

function report(overrides = {}) {
  return {
    task_id: "PF-001-example",
    acceptance_id: "AC-001",
    design_baseline_hash: "d".repeat(64),
    status: "implemented",
    summary: "Implemented",
    files_changed: [{ path: "src/example.ts", change: "modified" }],
    commands_run: [{ command: "node --test", result: "pass", notes: "passed" }],
    acceptance_evidence: ["reports/verification.json"],
    remaining_work: [],
    risks: [],
    scope_deviations: [],
    test_discipline: {
      applicable: true,
      red_evidence: "The focused test failed before implementation.",
      green_evidence: "The focused test passed after implementation.",
      refactor: "not-needed",
      not_applicable_reason: null,
    },
    ...overrides,
  };
}

function writeReport(value) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "implementation-evidence-"));
  fs.mkdirSync(path.join(root, "reports"));
  fs.writeFileSync(path.join(root, "reports/implementation.json"), JSON.stringify(value));
  return root;
}

test("applicable TDD requires Red and Green evidence", () => {
  const root = writeReport(report());
  assert.equal(validateImplementationReport(root, "reports/implementation.json", "PF-001-example").status, "implemented");

  const missingRed = writeReport(report({ test_discipline: { ...report().test_discipline, red_evidence: "" } }));
  assert.throws(() => validateImplementationReport(missingRed, "reports/implementation.json", "PF-001-example"), /red_evidence/);

  const missingGreen = writeReport(report({ test_discipline: { ...report().test_discipline, green_evidence: null } }));
  assert.throws(() => validateImplementationReport(missingGreen, "reports/implementation.json", "PF-001-example"), /green_evidence/);
});

test("non-applicable TDD requires an explicit reason and null test evidence", () => {
  const valid = report({
    test_discipline: {
      applicable: false,
      red_evidence: null,
      green_evidence: null,
      refactor: "not-applicable",
      not_applicable_reason: "Documentation-only change with no observable runtime behavior.",
    },
  });
  const root = writeReport(valid);
  assert.equal(validateImplementationReport(root, "reports/implementation.json", "PF-001-example").test_discipline.applicable, false);

  const missingReason = writeReport(report({
    test_discipline: {
      applicable: false,
      red_evidence: null,
      green_evidence: null,
      refactor: "not-applicable",
      not_applicable_reason: "",
    },
  }));
  assert.throws(() => validateImplementationReport(missingReason, "reports/implementation.json", "PF-001-example"), /not_applicable_reason/);
});

test("implementation report task identity is enforced", () => {
  const root = writeReport(report({ task_id: "PF-999-other" }));
  assert.throws(() => validateImplementationReport(root, "reports/implementation.json", "PF-001-example"), /task_id mismatch/);
});
