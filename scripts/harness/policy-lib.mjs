import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONTROL_PLANE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function loadCommandGuardrails(repoRoot = CONTROL_PLANE_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, "harness/policies/command-guardrails.json"), "utf8"));
}

export function compileRegex(entry) {
  return new RegExp(entry.regex, entry.flags ?? "");
}

export function cursorPermissionsForRole(policy, role = "read-only") {
  const extra = role === "implementer" ? policy.cursorPermissions.implementerExtraDeny : policy.cursorPermissions.readOnlyExtraDeny;
  return { permissions: { deny: [...new Set([...policy.cursorPermissions.baseDeny, ...extra])] } };
}

function renderCodexPrefixRule(rule) {
  return [
    `# policyId: ${rule.id}`,
    "prefix_rule(",
    `    pattern = ${JSON.stringify(rule.pattern)},`,
    `    decision = ${JSON.stringify(rule.decision)},`,
    `    justification = ${JSON.stringify(rule.justification)},`,
    `    match = ${JSON.stringify(rule.match)},`,
    ")",
    "",
  ].join("\n");
}

export function buildPolicyOutputs(repoRoot) {
  const policy = loadCommandGuardrails(repoRoot);
  const outputs = new Map();
  outputs.set(
    ".codex/rules/guardrails.rules",
    `# GENERATED FILE. DO NOT EDIT DIRECTLY.\n# Source: harness/policies/command-guardrails.json; run npm run harness:generate\n\n${policy.codexPrefixRules.map(renderCodexPrefixRule).join("\n")}`,
  );
  outputs.set(
    ".cursor/cli.json",
    `${JSON.stringify(cursorPermissionsForRole(policy, "read-only"), null, 2)}\n`,
  );
  outputs.set(
    ".cursor/hooks.json",
    `${JSON.stringify({
      version: 1,
      hooks: {
        preToolUse: [{
          command: "node scripts/harness/cursor-policy-hook.mjs",
          matcher: "Shell|Write|StrReplace|Delete|CallMcpTool",
          failClosed: false,
          timeout: 10,
        }],
      },
    }, null, 2)}\n`,
  );
  return outputs;
}

export function writePolicyOutputs(repoRoot) {
  const outputs = buildPolicyOutputs(repoRoot);
  for (const [relative, content] of outputs) {
    const target = path.join(repoRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  }
  return outputs;
}
