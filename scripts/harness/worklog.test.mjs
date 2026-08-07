import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const script = new URL("./worklog.mjs", import.meta.url).pathname;

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "worklog-"));
  spawnSync("git", ["init", "-q"], { cwd: root });
  fs.mkdirSync(path.join(root, ".harness/reports/PF-001"), { recursive: true });
  fs.writeFileSync(path.join(root, ".harness/reports/PF-001/result.json"), "{}\n");
  return root;
}

function run(root, args, extraEnv = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, TZ: "Asia/Tokyo", ...extraEnv },
  });
}

test("append uses local calendar metadata and context retrieves the entry", () => {
  const root = tempRepo();
  const result = run(root, [
    "append",
    "--actor", "agent",
    "--task", "PF-001",
    "--summary", "done",
    "--files", "src/example.ts",
    "--evidence", ".harness/reports/PF-001/result.json",
    "--verification", "passed",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const file = fs.readdirSync(path.join(root, "docs/worklog"))[0];
  assert.match(file, /^\d{4}-\d{2}\.md$/);
  const text = fs.readFileSync(path.join(root, "docs/worklog", file), "utf8");
  assert.match(text, /Time zone: Asia\/Tokyo/);
  assert.match(text, /UTC time: \d{4}-\d{2}-\d{2}T/);
  assert.match(text, /Evidence: \.harness\/reports\/PF-001\/result\.json/);
  const context = run(root, ["context"]);
  assert.equal(context.status, 0, context.stderr);
  assert.match(context.stdout, /Summary: done/);
});

test("correction appends a new entry without changing the original", () => {
  const root = tempRepo();
  const append = run(root, ["append", "--actor", "agent", "--task", "PF-001", "--summary", "original", "--verification", "passed"]);
  assert.equal(append.status, 0, append.stderr);
  const originalId = append.stdout.trim().split(/\s+/)[0];
  const file = path.join(root, "docs/worklog", fs.readdirSync(path.join(root, "docs/worklog"))[0]);
  const before = fs.readFileSync(file, "utf8");
  const correction = run(root, ["correct", "--id", originalId, "--actor", "human", "--reason", "Factual correction", "--summary", "corrected"]);
  assert.equal(correction.status, 0, correction.stderr);
  const after = fs.readFileSync(file, "utf8");
  assert.ok(after.startsWith(before), "original worklog bytes must remain unchanged");
  assert.match(after, new RegExp(`Corrects: ${originalId}`));
  assert.match(after, /Correction reason: Factual correction/);
  assert.match(after, /Summary: corrected/);
});

test("correction requires a human actor and an existing entry", () => {
  const root = tempRepo();
  const wrongActor = run(root, ["correct", "--id", "WL-20260805-missing", "--actor", "agent", "--reason", "x", "--summary", "y"]);
  assert.notEqual(wrongActor.status, 0);
  assert.match(wrongActor.stderr, /require --actor human/);

  const missing = run(root, ["correct", "--id", "WL-20260805-missing", "--actor", "human", "--reason", "x", "--summary", "y"]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /not found/);
});

test("append rejects secrets, multiline Markdown injection, and path traversal", () => {
  const root = tempRepo();
  const secret = run(root, ["append", "--actor", "agent", "--task", "PF-001", "--summary", `token=github_pat_${"x".repeat(28)}`, "--verification", "passed"]);
  assert.notEqual(secret.status, 0);
  assert.match(secret.stderr, /secret/);

  const multiline = run(root, ["append", "--actor", "agent", "--task", "PF-001", "--summary", "first\n## injected", "--verification", "passed"]);
  assert.notEqual(multiline.status, 0);
  assert.match(multiline.stderr, /single printable line/);

  const traversal = run(root, ["append", "--actor", "agent", "--task", "PF-001", "--summary", "done", "--evidence", "../secret.txt", "--verification", "passed"]);
  assert.notEqual(traversal.status, 0);
  assert.match(traversal.stderr, /escapes the repository root/);
});


test("append rejects unknown options and symlink evidence", () => {
  const root = tempRepo();
  const unknown = run(root, ["append", "--actor", "agent", "--task", "PF-001", "--summary", "done", "--verification", "passed", "--verificaton", "passed"]);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown option/);

  const target = path.join(root, ".harness/reports/PF-001/result.json");
  const link = path.join(root, ".harness/reports/PF-001/result-link.json");
  fs.symlinkSync(target, link);
  const symlink = run(root, ["append", "--actor", "agent", "--task", "PF-001", "--summary", "done", "--evidence", ".harness/reports/PF-001/result-link.json", "--verification", "passed"]);
  assert.notEqual(symlink.status, 0);
  assert.match(symlink.stderr, /symbolic link/);
});
test("append rejects invalid actor, task, and verification values", () => {
  const root = tempRepo();
  for (const args of [
    ["append", "--actor", "unknown", "--task", "PF-001", "--summary", "done", "--verification", "passed"],
    ["append", "--actor", "agent", "--task", "../../bad", "--summary", "done", "--verification", "passed"],
    ["append", "--actor", "agent", "--task", "PF-001", "--summary", "done", "--verification", "maybe"],
  ]) {
    const result = run(root, args);
    assert.notEqual(result.status, 0, args.join(" "));
  }
});
