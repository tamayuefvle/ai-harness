import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateReactDoctorArtifact } from "./artifact-validator.mjs";

function writeReport(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "react-doctor-validator-"));
  const reportPath = path.join(root, "react-doctor.json");
  const base = {
    schema_version: "1.0.0",
    tool: {
      name: "react-doctor",
      version: "0.7.7",
      expected_version: "0.7.7",
    },
    run: {
      mode: "changed",
      scope: "changed",
      blocking: "error",
      base: "0123456789abcdef0123456789abcdef01234567",
      active_spec: "PF-001-example",
      git_head: "89abcdef0123456789abcdef0123456789abcdef",
      started_at: "2026-08-05T00:00:00.000Z",
      finished_at: "2026-08-05T00:00:01.000Z",
      duration_ms: 1000,
      command: ["react-doctor", "--json"],
    },
    trigger: {
      react_manifests: ["package.json"],
      changed_files: ["src/example.tsx"],
      relevant_files: ["src/example.tsx"],
    },
    result: {
      status: "passed",
      exit_code: 0,
      signal: null,
      reason: null,
      counts: { errors: 0, warnings: 0 },
      raw_contract: {
        schema_version: 3,
        mode: "diff",
        react_detected: true,
        baseline_degraded: false,
        project_count: 1,
        incomplete_project_count: 0,
      },
      raw_report_path: null,
      stdout_excerpt: "",
      stderr_excerpt: "",
    },
  };
  const report = {
    ...base,
    ...overrides,
    tool: { ...base.tool, ...(overrides.tool ?? {}) },
    run: { ...base.run, ...(overrides.run ?? {}) },
    trigger: { ...base.trigger, ...(overrides.trigger ?? {}) },
    result: {
      ...base.result,
      ...(overrides.result ?? {}),
      counts: { ...base.result.counts, ...(overrides.result?.counts ?? {}) },
      raw_contract: {
        ...base.result.raw_contract,
        ...(overrides.result?.raw_contract ?? {}),
      },
    },
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { root, reportPath, head: report.run.git_head };
}

test("validateReactDoctorArtifact accepts schema versions 1 and 3", () => {
  for (const schemaVersion of [1, 3]) {
    const { reportPath, head } = writeReport({
      result: { raw_contract: { schema_version: schemaVersion } },
    });
    const result = validateReactDoctorArtifact(reportPath, "PF-001-example", head);
    assert.equal(result.status, "passed");
  }
});

test("validateReactDoctorArtifact rejects unsupported schema versions", () => {
  const { reportPath, head } = writeReport({
    result: { raw_contract: { schema_version: 2 } },
  });
  assert.throws(
    () => validateReactDoctorArtifact(reportPath, "PF-001-example", head),
    /React Doctor report is not passing/,
  );
});

test("validateReactDoctorArtifact treats baseline_degraded null as pass and true as fail", () => {
  const nullCase = writeReport({
    result: { raw_contract: { baseline_degraded: null } },
  });
  assert.equal(
    validateReactDoctorArtifact(nullCase.reportPath, "PF-001-example", nullCase.head).status,
    "passed",
  );

  const degraded = writeReport({
    result: { raw_contract: { baseline_degraded: true } },
  });
  assert.throws(
    () => validateReactDoctorArtifact(degraded.reportPath, "PF-001-example", degraded.head),
    /React Doctor report is not passing/,
  );
});
