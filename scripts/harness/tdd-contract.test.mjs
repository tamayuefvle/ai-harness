import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("implementation structured output requires test_discipline", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, "harness/schemas/implementation.schema.json"), "utf8"));
  assert.ok(schema.required.includes("test_discipline"));
  assert.deepEqual(schema.properties.test_discipline.required, [
    "applicable",
    "red_evidence",
    "green_evidence",
    "refactor",
    "not_applicable_reason",
  ]);
});

test("implementation and review prompts use the structured TDD contract without adding states", () => {
  const implement = fs.readFileSync(path.join(repoRoot, "harness/prompts/implement.md"), "utf8");
  const review = fs.readFileSync(path.join(repoRoot, "harness/prompts/review.md"), "utf8");
  const states = fs.readFileSync(path.join(repoRoot, "scripts/harness/lifecycle-gates.mjs"), "utf8");
  assert.match(implement, /Populate `test_discipline`/);
  assert.match(review, /`test_discipline` evidence/);
  assert.doesNotMatch(states, /"RED"|"GREEN"|"REFACTOR"/);
});
