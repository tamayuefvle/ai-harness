import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const activePath = path.join(repoRoot, "docs/specs/_active.md");
const activeText = fs.readFileSync(activePath, "utf8");
const activeSpec = activeText.match(/active_spec:\s*(\S+)/)?.[1] ?? "none";

let staged = [];
try {
  staged = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { cwd: repoRoot, encoding: "utf8" },
  ).trim().split("\n").filter(Boolean);
} catch {
  // CI or a fresh template may not have staged files.
}

const implementationPattern = /^(app|src|components|lib|content|public|tests|e2e)\//;
const implementationFiles = staged.filter((file) =>
  implementationPattern.test(file) ||
  /^(next\.config\.|package(-lock)?\.json|tsconfig\.json)/.test(file)
);

if (implementationFiles.length === 0) {
  console.log("No staged implementation files require an active spec.");
  process.exit(0);
}

if (activeSpec === "none") {
  console.error("Implementation files are staged, but active_spec is none:");
  for (const file of implementationFiles) console.error(`- ${file}`);
  console.error("Create a task: npm run task:new -- PF-001-slug \"Title\"");
  process.exit(1);
}

const specDir = path.join(repoRoot, "docs/specs", activeSpec);
const required = ["brief.md", "acceptance.md", "plan.md", "test-plan.md", "review.md", "delegation.md"];
const missing = required.filter((file) => !fs.existsSync(path.join(specDir, file)));
if (missing.length > 0) {
  console.error(`Active spec ${activeSpec} is incomplete: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`Active spec validated: ${activeSpec}`);
