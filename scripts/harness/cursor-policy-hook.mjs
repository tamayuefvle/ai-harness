import fs from "node:fs";
import path from "node:path";
import { loadCommandGuardrails, compileRegex } from "./policy-lib.mjs";

function flatten(value,out=[]){
  if(typeof value==="string") out.push(value);
  else if(Array.isArray(value)) for(const child of value) flatten(child,out);
  else if(value && typeof value==="object") for(const child of Object.values(value)) flatten(child,out);
  return out;
}
function pathFields(input){
  if(!input || typeof input!=="object") return [];
  const paths=[];
  for(const key of ["path","file_path","filePath","target_file","targetFile"]){
    if(typeof input[key]==="string") paths.push(input[key].replaceAll("\\","/"));
  }
  return paths;
}
function matchesGeneratedMarker(target, marker){
  if(target.includes(marker)) return true;
  const stripped=marker.replace(/^\//,"");
  return stripped.length>0 && stripped!==marker && target.includes(stripped);
}
function isExplicitNonImplementerRole(raw){
  if(raw===undefined) return false;
  if(raw==="") return false;
  return String(raw).trim()!=="implementer";
}
function deny(reason){
  process.stdout.write(`${JSON.stringify({permission:"deny",reason,user_message:reason,agent_message:reason})}\n`);
}
async function main(){
  const chunks=[]; let total=0; const limit=5*1024*1024;
  for await (const chunk of process.stdin){ total+=chunk.length; if(total>limit){deny("Hook input exceeded 5 MiB; denying defensively."); return;} chunks.push(chunk); }
  let event; try{event=JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");}catch{deny("Hook input was invalid JSON; denying defensively."); return;}
  const root=process.env.HARNESS_REPO_ROOT ? path.resolve(process.env.HARNESS_REPO_ROOT) : process.cwd();
  const policy=loadCommandGuardrails(root);
  const visible=flatten(event.tool_input??event).join("\n").replaceAll("\\","/");
  for(const entry of policy.commandPatterns.filter((x)=>x.surfaces.includes("cursor-hook"))){ if(compileRegex(entry).test(visible)){deny(`${entry.id}: ${entry.message}`); await new Promise(r=>setTimeout(r,60)); return;} }
  if(isExplicitNonImplementerRole(process.env.HARNESS_CURSOR_ROLE) && /\b(Write|StrReplace|Delete)\b/i.test(String(event.tool_name??event.hook_event_name??""))){deny("CURSOR-ROLE-READONLY: this Cursor worker is read-only."); await new Promise(r=>setTimeout(r,60)); return;}
  if(pathFields(event.tool_input??event).some((target)=>!target.includes("harness/rules/") && policy.generatedInstructionMarkers.some((marker)=>matchesGeneratedMarker(target,marker)))){deny("POLICY-GENERATED-INSTRUCTION: edit canonical harness sources and regenerate projections instead."); await new Promise(r=>setTimeout(r,60)); return;}
  process.stdout.write("{}\n");
  await new Promise(r=>setTimeout(r,60));
}
main().catch(async()=>{deny("Cursor policy hook failed; project permissions remain the primary hard boundary."); await new Promise(r=>setTimeout(r,60));});
