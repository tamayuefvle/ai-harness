import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { finalizeReviewReport } from "./finalize-review-report.mjs";

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

test("review finalizer binds canonical identity and evidence digests", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-finalizer-"));
  const evidencePath = path.join(root, "verification.json");
  fs.writeFileSync(evidencePath, '{"status":"passed"}\n');
  const report = {
    schema_version: "1.0.0",
    task_id: "PF-999-wrong",
    head_sha: "f".repeat(40),
    verdict: "approved",
    summary: "Reviewed.",
    findings: [],
    unverified_areas: [],
    test_recommendations: [],
    diagnostic_evidence: [{ tool: "verification", report: "verification.json", status: "passed", sha256: null, reviewed: true, notes: "Reviewed." }],
  };
  const finalized = finalizeReviewReport({
    report,
    taskId: "PF-001-example",
    headSha: "0".repeat(40),
    resolveEvidence(candidate) {
      assert.equal(candidate, "verification.json");
      return { absolute: evidencePath, relative: ".harness/reports/PF-001-example/verification.json" };
    },
  });
  assert.equal(finalized.task_id, "PF-001-example");
  assert.equal(finalized.head_sha, "0".repeat(40));
  assert.equal(finalized.diagnostic_evidence[0].report, ".harness/reports/PF-001-example/verification.json");
  assert.equal(finalized.diagnostic_evidence[0].sha256, sha256(evidencePath));
});

test("review finalizer rejects reports without diagnostic evidence", () => {
  assert.throws(() => finalizeReviewReport({
    report: { diagnostic_evidence: [] },
    taskId: "PF-001-example",
    headSha: "0".repeat(40),
    resolveEvidence() {
      throw new Error("should not run");
    },
  }), /requires at least one diagnostic_evidence/);
});
