import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contract = JSON.parse(fs.readFileSync(path.join(repoRoot, "harness/contracts/task-id.json"), "utf8"));

export const TASK_ID_PATTERN_SOURCE = contract.pattern;
export const TASK_ID_EXAMPLE = contract.example;
export const TASK_ID_PATTERN = new RegExp(TASK_ID_PATTERN_SOURCE);

export function isTaskId(value) {
  return typeof value === "string" && TASK_ID_PATTERN.test(value);
}

export function assertTaskId(value, label = "task ID") {
  if (!isTaskId(value)) {
    throw new Error(`${label} must match ${TASK_ID_PATTERN_SOURCE} (for example ${TASK_ID_EXAMPLE}).`);
  }
  return value;
}

export function nextPortfolioTaskId(existingNames, slug) {
  const numbers = existingNames
    .map((name) => name.match(/^PF-(\d+)(?:-|$)/)?.[1])
    .filter(Boolean)
    .map(Number);
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `PF-${String(next).padStart(3, "0")}-${slug}`;
}
