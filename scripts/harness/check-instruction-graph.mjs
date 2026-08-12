import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findGeneratedInstructionFiles, loadManifest } from "./rule-lib.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const errors=[];
const manifest=loadManifest(root);
const ids=new Set(), sources=new Set();
for(const role of manifest){
  if(ids.has(role.id)) errors.push(`Duplicate rule id: ${role.id}`); ids.add(role.id);
  if(sources.has(role.source)) errors.push(`Canonical rule source is owned by more than one manifest entry: ${role.source}`); sources.add(role.source);
  const agents=role.agentsTargets??[], codex=role.codexTargets??[], cursor=role.cursorTargets??[];
  if(agents.length && cursor.length) errors.push(`${role.id}: the same canonical source is projected to AGENTS and Cursor Rules, which duplicates Cursor context.`);
  for(const raw of agents){const target=typeof raw==="string"?raw:raw.path; if(target!=="AGENTS.md") errors.push(`${role.id}: nested AGENTS projection is forbidden in v14; use CODEX.md + scoped Cursor Rule: ${target}`);}
  for(const raw of codex){const target=typeof raw==="string"?raw:raw.path; if(!target.endsWith("CODEX.md")) errors.push(`${role.id}: Codex-specific projection must end in CODEX.md: ${target}`);}
  if(codex.length && !cursor.length) errors.push(`${role.id}: directory-specific canonical source has Codex projection without a Cursor-scoped projection.`);
}
const config=fs.readFileSync(path.join(root,".codex/config.toml"),"utf8");
if(!/^project_doc_fallback_filenames\s*=\s*\["CODEX\.md"\]/m.test(config)) errors.push('.codex/config.toml must declare CODEX.md as the Codex-only fallback instruction filename.');
for(const relative of findGeneratedInstructionFiles(root)) if(relative!=="AGENTS.md" && relative.endsWith("/AGENTS.md")) errors.push(`Nested generated AGENTS.md remains: ${relative}`);
if(errors.length){console.error("Instruction graph is ambiguous or duplicated:"); for(const e of errors) console.error(`- ${e}`); process.exit(1)}
const counts={shared:manifest.filter(x=>(x.agentsTargets??[]).length).length,codex:manifest.filter(x=>(x.codexTargets??[]).length).length,cursor:manifest.filter(x=>(x.cursorTargets??[]).length).length};
console.log(`[PASS] Instruction graph has one semantic owner per rule and no same-consumer AGENTS/Cursor duplication (shared=${counts.shared}, codex=${counts.codex}, cursor=${counts.cursor}).`);
