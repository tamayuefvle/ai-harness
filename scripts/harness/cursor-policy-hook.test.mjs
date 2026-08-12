import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hook = path.join(repoRoot, "scripts/harness/cursor-policy-hook.mjs");

function invoke(event, role = "implementer") {
  const result = spawnSync(process.execPath, [hook], {
    cwd: repoRoot,
    input: JSON.stringify(event),
    encoding: "utf8",
    env: { ...process.env, HARNESS_REPO_ROOT: repoRoot, HARNESS_CURSOR_ROLE: role },
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
  const result = invoke({ tool_name: "Write", tool_input: { path: "src/a.ts", contents: "x" } }, "reviewer");
  assert.equal(result.permission, "deny");
  assert.match(result.reason, /CURSOR-ROLE-READONLY/);
});

test("Cursor policy hook permits ordinary implementer writes but denies generated instruction projections", () => {
  assert.deepEqual(invoke({ tool_name: "Write", tool_input: { path: "src/a.ts", contents: "x" } }), {});
  const generated = invoke({ tool_name: "Write", tool_input: { path: "docs/CODEX.md", contents: "x" } });
  assert.equal(generated.permission, "deny");
  assert.match(generated.reason, /POLICY-GENERATED-INSTRUCTION/);
});
