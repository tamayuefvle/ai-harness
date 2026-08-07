import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const roots = [path.join(repoRoot, "scripts")];
const tests = [];
for (const root of roots) {
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.name.endsWith(".test.mjs")) tests.push(path.relative(repoRoot, absolute));
    }
  }
}
tests.sort();
if (!tests.length) {
  console.error("No harness tests found.");
  process.exit(1);
}
console.log(`[INFO] Running ${tests.length} harness test files`);
const result = spawnSync(process.execPath, ["--test", ...tests], { cwd: repoRoot, stdio: "inherit" });
process.exit(result.status ?? 1);
