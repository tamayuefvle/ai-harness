import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildMigratedGate } from "./migrate-gates.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const template = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs/specs/TEMPLATE/gate.json"), "utf8"));

test("1.0 gate migration preserves history but resets downstream evidence", () => {
  const existing = {
    schemaVersion: "1.0.0",
    history: [{ action: "old", actor: "human", reason: "old", at: "2026-08-04T00:00:00.000Z" }],
    implementation: { status: "passed" },
    verification: { status: "passed" },
    review: { verdict: "approved" },
  };
  const gate = buildMigratedGate({
    template,
    existingGate: existing,
    taskId: "PF-001-example",
    actor: "human",
    reason: "upgrade",
    baselineSha: "a".repeat(40),
    specHash: "b".repeat(64),
    planHash: "c".repeat(64),
    at: "2026-08-05T00:00:00.000Z",
  });
  assert.equal(gate.schemaVersion, "1.1.0");
  assert.equal(gate.implementation.status, "pending");
  assert.equal(gate.verification.status, "pending");
  assert.equal(gate.review.status, "pending");
  assert.equal(gate.releaseApproval.status, "pending");
  assert.equal(gate.history[0].action, "old");
  assert.equal(gate.history.at(-1).action, "schema-1.1-migration");
});
