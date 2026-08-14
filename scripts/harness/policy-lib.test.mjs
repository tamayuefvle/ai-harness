import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPolicyOutputs } from "./policy-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("projects Cursor preToolUse as fail-closed for security-critical matchers", () => {
  const outputs = buildPolicyOutputs(repoRoot);
  const config = JSON.parse(outputs.get(".cursor/hooks.json"));
  const hook = config.hooks.preToolUse[0];
  assert.equal(hook.failClosed, true);
  assert.match(hook.matcher, /Shell/);
  assert.match(hook.matcher, /Write/);
});
