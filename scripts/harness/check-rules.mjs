import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOutputs } from "./rule-lib.mjs";
import { buildSkillOutputs } from "./skill-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const expected = buildOutputs(repoRoot);
for (const [relative, content] of buildSkillOutputs(repoRoot)) expected.set(relative, content);
const failures = [];

for (const [relativePath, expectedContent] of expected) {
  const target = path.join(repoRoot, relativePath);
  if (!fs.existsSync(target)) {
    failures.push(`${relativePath}: missing`);
    continue;
  }
  const actualContent = fs.readFileSync(target, "utf8");
  if (actualContent !== expectedContent) {
    failures.push(`${relativePath}: out of sync`);
  }
}

const publicRoot = path.join(repoRoot, "public");
if (fs.existsSync(publicRoot)) {
  const pending = [publicRoot];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(repoRoot, absolute).replaceAll("\\", "/");

      if (entry.name === "AGENTS.md" || entry.name === ".cursor" || entry.name === ".codex") {
        failures.push(`${relative}: harness instruction must not be published from public/`);
        continue;
      }

      if (entry.isDirectory()) pending.push(absolute);
    }
  }
}

if (failures.length > 0) {
  console.error("Generated AI rules are not synchronized or safe:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("Run: npm run harness:generate");
  process.exit(1);
}

console.log("AI rules are synchronized and no harness instructions are published from public/.");
