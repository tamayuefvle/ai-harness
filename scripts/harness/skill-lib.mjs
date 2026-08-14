import fs from "node:fs";
import path from "node:path";

const GENERATED_MARKER = "<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->";

function assertSafe(relative) {
  if (!relative || path.isAbsolute(relative)) throw new Error("Skill path must be repository-relative.");
  const normalized=path.posix.normalize(relative.replaceAll("\\","/"));
  if (normalized===".." || normalized.startsWith("../")) throw new Error(`Skill path escapes repository: ${relative}`);
}

export function buildSkillOutputs(repoRoot) {
  const sourceRoot=path.join(repoRoot,"harness/skills");
  const outputs=new Map();
  if (!fs.existsSync(sourceRoot)) return outputs;
  for (const entry of fs.readdirSync(sourceRoot,{withFileTypes:true})) {
    if (!entry.isDirectory()) continue;
    const source=path.join(sourceRoot,entry.name,"SKILL.md");
    if (!fs.existsSync(source)) continue;
    const relative=`.cursor/skills/${entry.name}/SKILL.md`;
    assertSafe(relative);
    const body=fs.readFileSync(source,"utf8").trimEnd();
    outputs.set(relative,`${GENERATED_MARKER}\n<!-- Source: harness/skills/${entry.name}/SKILL.md; run npm run harness:generate -->\n\n${body}\n`);
  }
  return outputs;
}

function pruneObsoleteGeneratedSkills(repoRoot, outputs) {
  const generatedRoot=path.join(repoRoot,".cursor/skills");
  if (!fs.existsSync(generatedRoot)) return [];
  const removed=[];
  for (const entry of fs.readdirSync(generatedRoot,{withFileTypes:true})) {
    if (!entry.isDirectory()) continue;
    const relative=`.cursor/skills/${entry.name}/SKILL.md`;
    if (outputs.has(relative)) continue;
    const target=path.join(repoRoot,relative);
    if (!fs.existsSync(target)) continue;
    const text=fs.readFileSync(target,"utf8");
    if (!text.startsWith(GENERATED_MARKER)) continue;
    fs.rmSync(path.dirname(target),{recursive:true,force:true});
    removed.push(relative);
  }
  return removed;
}

export function writeSkillOutputs(repoRoot) {
  const outputs=buildSkillOutputs(repoRoot);
  pruneObsoleteGeneratedSkills(repoRoot,outputs);
  for (const [relative,content] of outputs) {
    const target=path.join(repoRoot,relative);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,content,"utf8");
  }
  return outputs;
}
