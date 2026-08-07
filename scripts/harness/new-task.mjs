import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localDate } from "./time.mjs";
import { assertTaskId } from "./task-id.mjs";
import { assertProjectAllowsDelivery } from "./full-lifecycle-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
assertProjectAllowsDelivery(repoRoot);
const [taskId, ...titleParts] = process.argv.slice(2);
const title = titleParts.join(" ").trim();

try {
  assertTaskId(taskId);
} catch (error) {
  console.error(error.message);
  console.error("Usage: npm run task:new -- PF-001-homepage \"Homepage MVP\"");
  process.exit(1);
}
if (!title) {
  console.error("A human-readable title is required.");
  process.exit(1);
}

const activePath = path.join(repoRoot, "docs/specs/_active.md");
const activeText = fs.readFileSync(activePath, "utf8");
const current = activeText.match(/active_spec:\s*(\S+)/)?.[1] ?? "none";
if (current !== "none") {
  console.error(`Another spec is active: ${current}`);
  process.exit(1);
}

const destination = path.join(repoRoot, "docs/specs", taskId);
if (fs.existsSync(destination)) {
  console.error(`Spec already exists: docs/specs/${taskId}`);
  process.exit(1);
}

const templateDir = path.join(repoRoot, "docs/specs/TEMPLATE");
fs.cpSync(templateDir, destination, { recursive: true });
for (const filename of fs.readdirSync(destination)) {
  const target = path.join(destination, filename);
  const content = fs.readFileSync(target, "utf8")
    .replaceAll("{{TASK_ID}}", taskId)
    .replaceAll("{{TITLE}}", title)
    .replaceAll("PF-000-template", taskId);
  fs.writeFileSync(target, content, "utf8");
}

const today = localDate();
const active = [
  "---",
  `active_spec: ${taskId}`,
  "status: IDEA",
  `updated_at: ${today}`,
  "---",
  "",
  `Active task: \`docs/specs/${taskId}/\``,
  "",
].join("\n");
fs.writeFileSync(activePath, active, "utf8");

console.log(`Created and activated docs/specs/${taskId}`);
