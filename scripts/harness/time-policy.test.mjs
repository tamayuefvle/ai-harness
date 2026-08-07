import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relative) {
  return fs.readFileSync(path.join(repoRoot, relative), "utf8");
}

test("human-facing calendar dates use the shared local-date utility", () => {
  const scripts = [
    "scripts/harness/start-task.mjs",
    "scripts/harness/new-task.mjs",
    "scripts/harness/advance-task.mjs",
    "scripts/harness/rework-task.mjs",
    "scripts/harness/complete-task.mjs",
  ];
  for (const script of scripts) {
    const text = read(script);
    assert.match(text, /localDate/);
    assert.doesNotMatch(text, /toISOString\(\)\.slice\(0,\s*10\)/);
  }
});

test("machine lifecycle timestamps use the shared UTC utility", () => {
  assert.match(read("scripts/harness/lifecycle-gates.mjs"), /return utcTimestamp\(\)/);
  assert.match(read("scripts/harness/record-delegation.mjs"), /const now = utcTimestamp\(\)/);
});

test("the time policy documents local and UTC responsibilities", () => {
  const policy = read("docs/workflow/TIME_POLICY.md");
  assert.match(policy, /UTC ISO 8601/);
  assert.match(policy, /local calendar date/);
  assert.match(policy, /IANA time-zone identifier/);
});
