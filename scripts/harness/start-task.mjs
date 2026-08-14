import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localDate } from "./time.mjs";
import { assertTaskId, nextPortfolioTaskId } from "./task-id.mjs";
import { assertProjectAllowsDelivery } from "./full-lifecycle-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
assertProjectAllowsDelivery(repoRoot);
const [title, requestedSlug] = process.argv.slice(2);

if (!title?.trim()) {
  console.error('Usage: npm run task:start -- "Human readable title" "english-slug"');
  process.exit(1);
}

const activePath = path.join(repoRoot, "docs/specs/_active.md");
const activeText = fs.readFileSync(activePath, "utf8");
const activeSpec = activeText.match(/active_spec:\s*(\S+)/)?.[1] ?? "none";
if (activeSpec !== "none") {
  console.error(`Another task is active: ${activeSpec}`);
  process.exit(1);
}

const specsRoot = path.join(repoRoot, "docs/specs");
const existingNames = fs.readdirSync(specsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

function slugify(value) {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "task";
}

const slug = slugify(requestedSlug || title);
const taskId = nextPortfolioTaskId(existingNames, slug);
assertTaskId(taskId);
const destination = path.join(specsRoot, taskId);
const templateDir = path.join(specsRoot, "TEMPLATE");

if (fs.existsSync(destination)) {
  console.error(`Task already exists: docs/specs/${taskId}`);
  process.exit(1);
}

fs.cpSync(templateDir, destination, { recursive: true });
for (const entry of fs.readdirSync(destination, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const target = path.join(destination, entry.name);
  const content = fs
    .readFileSync(target, "utf8")
    .replaceAll("{{TASK_ID}}", taskId)
    .replaceAll("{{TITLE}}", title.trim())
    .replaceAll("PF-000-template", taskId);
  fs.writeFileSync(target, content, "utf8");
}

const today = localDate();
const active = [
  "---",
  `active_spec: ${taskId}`,
  "status: DESIGNING",
  `updated_at: ${today}`,
  "---",
  "",
  `Active task: \`docs/specs/${taskId}/\``,
  "",
].join("\n");

fs.writeFileSync(activePath, active, "utf8");
console.log(JSON.stringify({
  created: taskId,
  title: title.trim(),
  specPath: `docs/specs/${taskId}`,
  status: "DESIGNING",
}, null, 2));
