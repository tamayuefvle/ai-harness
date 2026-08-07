import fs from "node:fs"; import path from "node:path";
import { canonicalRoot, parseOptions, safeId, writeJsonAtomic } from "./full-lifecycle-lib.mjs";
const options=parseOptions(process.argv.slice(2)); const file=path.join(canonicalRoot,"harness/project.json");
if(fs.existsSync(file)) throw new Error("harness/project.json already exists. Use project:gate/project:advance or migration commands.");
const id=safeId(options.id ?? "new-project",/^[a-z0-9][a-z0-9-]{2,63}$/,"project id");
writeJsonAtomic(file,{schemaVersion:"1.0.0",projectId:id,lifecycleMode:"full",state:"DISCOVERY",pendingApproval:null,decisionRefs:[],activeProfiles:[],profileResolutionPath:null,migration:null,history:[]});
console.log(JSON.stringify({projectId:id,state:"DISCOVERY"},null,2));
