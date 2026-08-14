import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const distributionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const planningTemplateRoot = path.join(distributionRoot, "harness/templates/planning");

export const PLANNING_DOC_PATHS = [
  "docs/product/problem.md",
  "docs/product/users.md",
  "docs/product/outcomes.md",
  "docs/product/requirements.md",
  "docs/product/idea-backlog.md",
  "docs/product/technology-options.md",
  "docs/product/technology-decision.md",
  "docs/architecture/baseline.md",
  "docs/architecture/security-baseline.md",
  "docs/architecture/quality-strategy.md",
];

function canonicalTemplatePath(relativePath) {
  if (!PLANNING_DOC_PATHS.includes(relativePath)) {
    throw new Error(`No planning doc template for ${relativePath}`);
  }
  return path.join(planningTemplateRoot, relativePath.replace(/^docs\//, ""));
}

export function planningDocTemplate(relativePath) {
  return fs.readFileSync(canonicalTemplatePath(relativePath), "utf8");
}

export const PLANNING_DOC_TEMPLATES = Object.fromEntries(
  PLANNING_DOC_PATHS.map((relativePath) => [relativePath, planningDocTemplate(relativePath)]),
);

export function writePlanningDocs(root, relativePaths = PLANNING_DOC_PATHS) {
  for (const relativePath of relativePaths) {
    const dest = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, planningDocTemplate(relativePath));
  }
}

export function liveDocsStillMatchPlanningTemplates(root = distributionRoot) {
  return PLANNING_DOC_PATHS.every((relativePath) => {
    const livePath = path.join(root, relativePath);
    return fs.existsSync(livePath) && fs.readFileSync(livePath, "utf8") === planningDocTemplate(relativePath);
  });
}
