import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeOutputs } from "./rule-lib.mjs";
import { writeSkillOutputs } from "./skill-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outputs = writeOutputs(repoRoot);
const skills = writeSkillOutputs(repoRoot);

console.log(`Generated ${outputs.size} rule files and ${skills.size} Cursor skill files.`);
