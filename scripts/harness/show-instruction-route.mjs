import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const requested = process.argv[2] ?? ".";
const absolute = path.resolve(repoRoot, requested);

if (absolute !== repoRoot && !absolute.startsWith(`${repoRoot}${path.sep}`)) {
  console.error("Target must be inside the repository.");
  process.exit(1);
}

let targetDirectory = absolute;
if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
  targetDirectory = path.dirname(absolute);
} else if (!fs.existsSync(absolute) && path.extname(absolute)) {
  targetDirectory = path.dirname(absolute);
}

const relativeDirectory = path.relative(repoRoot, targetDirectory);
const segments = relativeDirectory ? relativeDirectory.split(path.sep) : [];
const directories = [repoRoot];
let current = repoRoot;

for (const segment of segments) {
  current = path.join(current, segment);
  directories.push(current);
}

const chain = directories
  .map((directory) => path.join(directory, "AGENTS.md"))
  .filter((candidate) => fs.existsSync(candidate))
  .map((candidate) => path.relative(repoRoot, candidate) || "AGENTS.md");

console.log(`Target: ${path.relative(repoRoot, absolute) || "."}`);
if (chain.length === 0) {
  console.log("Instruction chain: none");
  process.exit(0);
}

console.log("Instruction chain:");
for (const [index, item] of chain.entries()) {
  const label = index === 0 ? "command center" : "specialized role";
  console.log(`${index + 1}. ${item} (${label})`);
}
console.log("The deepest applicable file has the most specific guidance.");
