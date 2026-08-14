import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hook = path.join(repoRoot, "scripts/harness/cursor-policy-hook.mjs");

function invoke(event, { role = "implementer", omitRole = false } = {}) {
  const env = { ...process.env, HARNESS_REPO_ROOT: repoRoot, HARNESS_CURSOR_ROLE: role };
  if (omitRole) delete env.HARNESS_CURSOR_ROLE;
  const result = spawnSync(process.execPath, [hook], {
    cwd: repoRoot,
    input: JSON.stringify(event),
    encoding: "utf8",
    env,
    timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test("Cursor policy hook denies canonical dangerous commands", () => {
  for (const [command, policyId] of [["git reset --hard", "CMD-GIT-HARD-RESET"], ["sudo npm test", "CMD-SUDO-USE"], ["su root", "CMD-SU-USE"]]) {
    const result = invoke({ tool_name: "Shell", tool_input: { command } });
    assert.equal(result.permission, "deny");
    assert.match(result.reason, new RegExp(policyId));
  }
});

test("Cursor policy hook denies writes from read-only workers", () => {
  const result = invoke({ tool_name: "Write", tool_input: { path: "src/a.ts", contents: "x" } }, { role: "reviewer" });
  assert.equal(result.permission, "deny");
  assert.match(result.reason, /CURSOR-ROLE-READONLY/);
});

test("Cursor policy hook permits ordinary implementer writes but denies generated instruction projections", () => {
  assert.deepEqual(invoke({ tool_name: "Write", tool_input: { path: "src/a.ts", contents: "x" } }), {});
  const generated = invoke({ tool_name: "Write", tool_input: { path: "docs/CODEX.md", contents: "x" } });
  assert.equal(generated.permission, "deny");
  assert.match(generated.reason, /POLICY-GENERATED-INSTRUCTION/);
});

test("Cursor policy hook permits ordinary IDE writes when the role is unset or empty", () => {
  assert.deepEqual(invoke({ tool_name: "Write", tool_input: { path: "docs/product/problem.md", contents: "x" } }, { omitRole: true }), {});
  assert.deepEqual(invoke({ tool_name: "Write", tool_input: { path: "src/a.ts", contents: "x" } }, { role: "" }), {});
});

test("Cursor policy hook denies writes from explicit read-only roles", () => {
  const result = invoke({ tool_name: "Write", tool_input: { path: "src/a.ts", contents: "x" } }, { role: "read-only" });
  assert.equal(result.permission, "deny");
  assert.match(result.reason, /CURSOR-ROLE-READONLY/);
});

test("Cursor policy hook keeps generated-instruction and dangerous-command denials when the role is unset", () => {
  const generated = invoke({ tool_name: "Write", tool_input: { path: "docs/CODEX.md", contents: "x" } }, { omitRole: true });
  assert.equal(generated.permission, "deny");
  assert.match(generated.reason, /POLICY-GENERATED-INSTRUCTION/);

  const bypass = invoke({
    tool_name: "Write",
    tool_input: { path: "docs/CODEX.md", contents: "see harness/rules/docs-router.md" },
  }, { omitRole: true });
  assert.equal(bypass.permission, "deny");
  assert.match(bypass.reason, /POLICY-GENERATED-INSTRUCTION/);

  const relativeCli = invoke({ tool_name: "Write", tool_input: { path: ".cursor/cli.json", contents: "{}" } }, { omitRole: true });
  assert.equal(relativeCli.permission, "deny");
  assert.match(relativeCli.reason, /POLICY-GENERATED-INSTRUCTION/);

  const mixed = invoke({
    tool_name: "Write",
    tool_input: { path: "docs/CODEX.md", file_path: "harness/rules/product.md", contents: "x" },
  }, { omitRole: true });
  assert.equal(mixed.permission, "deny");
  assert.match(mixed.reason, /POLICY-GENERATED-INSTRUCTION/);

  const dangerous = invoke({ tool_name: "Shell", tool_input: { command: "git reset --hard" } }, { omitRole: true });
  assert.equal(dangerous.permission, "deny");
  assert.match(dangerous.reason, /CMD-GIT-HARD-RESET/);
});

test("Cursor policy hook denies writes from whitespace-only or unknown explicit roles", () => {
  for (const role of [" ", "mystery"]) {
    const result = invoke({ tool_name: "Write", tool_input: { path: "src/a.ts", contents: "x" } }, { role });
    assert.equal(result.permission, "deny");
    assert.match(result.reason, /CURSOR-ROLE-READONLY/);
  }
});

test("Cursor policy hook still allows canonical harness rule source edits", () => {
  assert.deepEqual(invoke({ tool_name: "Write", tool_input: { path: "harness/rules/product.md", contents: "x" } }, { omitRole: true }), {});
});


test("Cursor policy hook denies defensively when its canonical policy cannot be loaded", () => {
  const result = spawnSync(process.execPath, [hook], {
    cwd: repoRoot,
    input: JSON.stringify({ tool_name: "Write", tool_input: { path: "src/a.ts", contents: "x" } }),
    encoding: "utf8",
    env: { ...process.env, HARNESS_REPO_ROOT: path.join(repoRoot, "missing-policy-root") },
    timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  const decision = JSON.parse(result.stdout.trim());
  assert.equal(decision.permission, "deny");
  assert.match(decision.reason, /configured fail-closed/);
});
