import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(root, "harness/capabilities/manifest.json");
const data = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const errors = [];

if (data.schemaVersion !== "1.1.0" || !Array.isArray(data.capabilities)) errors.push("invalid manifest root");
const ids = new Set();
for (const cap of data.capabilities ?? []) {
  if (ids.has(cap.id)) errors.push(`duplicate capability: ${cap.id}`);
  ids.add(cap.id);
  if (!Array.isArray(cap.providers) || cap.providers.length === 0) errors.push(`no providers: ${cap.id}`);
  const providerIds = new Set();
  for (const provider of cap.providers ?? []) {
    if (providerIds.has(provider.id)) errors.push(`duplicate provider in ${cap.id}: ${provider.id}`);
    providerIds.add(provider.id);
    if (!Array.isArray(provider.operations) || provider.operations.length === 0) errors.push(`no operations: ${cap.id}/${provider.id}`);
    if (provider.confidenceScore !== undefined && (!Number.isInteger(provider.confidenceScore) || provider.confidenceScore < 0 || provider.confidenceScore > 100)) errors.push(`invalid confidence score: ${cap.id}/${provider.id}`);
  }
}

if (!ids.has("github") || !ids.has("documentation")) errors.push("required capability missing");
const documentation = (data.capabilities ?? []).find((cap) => cap.id === "documentation");
if (!documentation?.resolutionStrategy) errors.push("documentation resolution strategy missing");
else {
  const trigger = documentation.resolutionStrategy.context7Trigger;
  if (trigger?.mode !== "all" || trigger?.default !== "disabled" || trigger?.onUnavailable !== "degrade-without-blocking") errors.push("invalid Context7 trigger policy");
  if (!Array.isArray(trigger?.conditions) || trigger.conditions.length === 0 || new Set(trigger.conditions).size !== trigger.conditions.length) errors.push("Context7 trigger conditions must be a non-empty unique list in the manifest");
  const context7 = documentation.providers.find((provider) => provider.id === "context7-cli");
  if (!context7 || context7.enabledByDefault !== false || context7.required !== false) errors.push("Context7 must be optional and disabled by default");
  if (context7?.trigger !== "documentation.resolutionStrategy.context7Trigger") errors.push("Context7 trigger reference mismatch");
  if (documentation.resolutionStrategy.materialDecisionRequiresPrimarySource !== true) errors.push("material decisions must require a primary source");
}

if (errors.length) {
  for (const error of errors) console.error(`[FAIL] ${error}`);
  process.exit(1);
}
console.log(`[PASS] ${data.capabilities.length} capabilities validated; documentation fallback policy is manifest-owned`);
