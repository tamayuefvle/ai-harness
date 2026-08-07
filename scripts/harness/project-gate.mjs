import fs from "node:fs"; import path from "node:path";
import { assertNoLikelySecret, canonicalRoot, parseOptions, readJson, requireHuman, sha256Files, transitionFor, writeJsonAtomic } from "./full-lifecycle-lib.mjs";
const options=parseOptions(process.argv.slice(2)); requireHuman(options.actor); assertNoLikelySecret(options.reason ?? ""); if(!options.to||!options.reason) throw new Error("Usage: project:gate -- --to <STATE> --actor human:<name> --reason <text>");
const file=path.join(canonicalRoot,"harness/project.json"); const project=readJson(file); const transition=transitionFor(canonicalRoot,"project",project.state,options.to);
const docs=transition.requiredDocuments; const contractHash=sha256Files(canonicalRoot,docs);
project.pendingApproval={targetState:options.to,approvedBy:options.actor,approvedAt:new Date().toISOString(),reason:options.reason,contractHash}; writeJsonAtomic(file,project);
console.log(JSON.stringify({from:project.state,to:options.to,requiredDocuments:docs,contractHash},null,2));
