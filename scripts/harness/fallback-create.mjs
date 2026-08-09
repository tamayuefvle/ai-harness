import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import { createHandoff, readJson } from "./fallback-lib.mjs"; import { validateAgainstSchema, schemaFor } from "./artifact-validator.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const inputPath=process.argv[2]; if(!inputPath){console.error("Usage: fallback:create -- <input.json>");process.exit(2)}
const absolute=path.resolve(root,inputPath); if(!absolute.startsWith(root+path.sep)){console.error("Input must be inside the repository.");process.exit(2)}
if (!fs.existsSync(absolute) || fs.lstatSync(absolute).isSymbolicLink() || !fs.realpathSync(absolute).startsWith(fs.realpathSync(root)+path.sep)) { console.error("Input must be an existing non-symlink file inside the repository."); process.exit(2); }
const handoff=createHandoff(root,readJson(absolute)); validateAgainstSchema(handoff,schemaFor("fallbackHandoff"),"Fallback handoff");
const dir=path.join(root,".harness/reports",handoff.taskId,"fallback"); fs.mkdirSync(dir,{recursive:true});
const out=path.join(dir,`${handoff.handoffId}.json`); fs.writeFileSync(out,JSON.stringify(handoff,null,2)+"\n");
console.log(path.relative(root,out).replaceAll("\\","/"));
