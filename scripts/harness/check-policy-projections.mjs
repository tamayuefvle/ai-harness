import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPolicyOutputs } from "./policy-lib.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const failures=[];
for(const [relative,expected] of buildPolicyOutputs(root)){
  const target=path.join(root,relative);
  if(!fs.existsSync(target)) failures.push(`${relative}: missing`);
  else if(fs.readFileSync(target,"utf8")!==expected) failures.push(`${relative}: out of sync`);
}
if(failures.length){console.error("Generated policy projections are stale:"); for(const f of failures) console.error(`- ${f}`); process.exit(1)}
console.log("Command/tool policy projections are synchronized from one canonical manifest.");
