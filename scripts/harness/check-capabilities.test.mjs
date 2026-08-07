import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const data = JSON.parse(fs.readFileSync(path.join(root, "harness/capabilities/manifest.json"), "utf8"));

test("capability manifest has unique canonical capability and provider IDs", () => {
  assert.equal(data.schemaVersion, "1.1.0");
  assert.equal(new Set(data.capabilities.map((cap) => cap.id)).size, data.capabilities.length);
  for (const capability of data.capabilities) {
    assert.ok(capability.providers.length > 0);
    assert.equal(new Set(capability.providers.map((provider) => provider.id)).size, capability.providers.length);
  }
});

test("Context7 is an all-conditions optional fallback", () => {
  const documentation = data.capabilities.find((cap) => cap.id === "documentation");
  const context7 = documentation.providers.find((provider) => provider.id === "context7-cli");
  assert.equal(context7.required, false);
  assert.equal(context7.enabledByDefault, false);
  assert.equal(documentation.resolutionStrategy.context7Trigger.mode, "all");
  assert.ok(documentation.resolutionStrategy.context7Trigger.conditions.length > 0);
  assert.equal(documentation.resolutionStrategy.context7Trigger.onUnavailable, "degrade-without-blocking");
  assert.equal(documentation.resolutionStrategy.materialDecisionRequiresPrimarySource, true);
});

test("manifest is the only source of Context7 condition identifiers", () => {
  const conditions = data.capabilities.find((cap) => cap.id === "documentation").resolutionStrategy.context7Trigger.conditions;
  const scanRoots = ["harness/rules", "harness/prompts", "docs/workflow", "scripts/harness"];
  const offenders = [];
  for (const relative of scanRoots) {
    const pending = [path.join(root, relative)];
    while (pending.length) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(absolute);
        else if (!absolute.endsWith("manifest.json")) {
          const text = fs.readFileSync(absolute, "utf8");
          for (const condition of conditions) if (text.includes(condition)) offenders.push(`${path.relative(root, absolute)}:${condition}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, []);
});
