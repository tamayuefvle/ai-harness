import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertTaskId, isTaskId, nextPortfolioTaskId, TASK_ID_PATTERN_SOURCE } from "./task-id.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("task ID contract accepts canonical PF and non-PF prefixes", () => {
  assert.equal(isTaskId("PF-001-example"), true);
  assert.equal(isTaskId("SEC-0001-security"), true);
  assert.equal(assertTaskId("OPS-999"), "OPS-999");
});

test("task ID contract rejects lowercase, short numbers, and unsafe slugs", () => {
  for (const value of ["pf-001-example", "PF-1-example", "PF-001-Example", "PF-001-../escape", "ci"]) {
    assert.equal(isTaskId(value), false, value);
  }
});

test("portfolio task allocation uses the shared canonical format", () => {
  assert.equal(nextPortfolioTaskId(["PF-001-one", "SEC-010-other", "PF-009-nine"], "next"), "PF-010-next");
});


test("task ID schema projections match the canonical contract", () => {
  for (const [relative, property] of [["harness/schemas/lifecycle-gate.schema.json", "taskId"], ["harness/schemas/verification.schema.json", "taskId"], ["harness/schemas/review.schema.json", "task_id"]]) {
    const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, relative), "utf8"));
    assert.equal(schema.properties[property].pattern, TASK_ID_PATTERN_SOURCE);
    assert.match(schema.properties[property].$comment, /harness\/contracts\/task-id\.json/);
  }
});
