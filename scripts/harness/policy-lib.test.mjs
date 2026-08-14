import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildPolicyOutputs } from "./policy-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("Cursor security-critical preToolUse policy projection is fail-closed", () => {
  const output = buildPolicyOutputs(repoRoot).get(".cursor/hooks.json");
  const config = JSON.parse(output);
  const hook = config.hooks.preToolUse[0];
  assert.equal(hook.failClosed, true);
  assert.match(hook.matcher, /Shell/);
  assert.match(hook.matcher, /Write/);
});
