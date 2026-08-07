import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const check = process.argv.includes("--check");
const taskIdContractPath = path.join(repoRoot, "harness/contracts/task-id.json");
const contract = JSON.parse(fs.readFileSync(taskIdContractPath, "utf8"));
const targets = [
  ["harness/schemas/lifecycle-gate.schema.json", ["properties", "taskId"]],
  ["harness/schemas/verification.schema.json", ["properties", "taskId"]],
  ["harness/schemas/review.schema.json", ["properties", "task_id"]],
];

let changed = false;
for (const [relative, keys] of targets) {
  const target = path.join(repoRoot, relative);
  const schema = JSON.parse(fs.readFileSync(target, "utf8"));
  let node = schema;
  for (const key of keys) node = node[key];
  const expectedComment = `${keys.at(-1)}.pattern is generated from harness/contracts/task-id.json; run npm run harness:generate`;
  if (node.pattern !== contract.pattern || node.$comment !== expectedComment) {
    changed = true;
    if (!check) {
      node.pattern = contract.pattern;
      node.$comment = expectedComment;
      fs.writeFileSync(target, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
    }
  }
}

if (check && changed) {
  console.error("Canonical contract projections are stale. Run npm run harness:generate.");
  process.exit(1);
}
console.log(check ? "Canonical contract projections are synchronized." : "Generated canonical contract projections.");
