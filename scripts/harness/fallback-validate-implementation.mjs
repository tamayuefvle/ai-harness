import path from "node:path"; import { fileURLToPath } from "node:url"; import { validateFallbackForImplementation } from "./fallback-lib.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."); const [decision,task,ac]=process.argv.slice(2); if(!decision||!task||!ac){console.error("Usage: fallback-validate-implementation <decision> <task> <AC>");process.exit(2)}
console.log(JSON.stringify(validateFallbackForImplementation(root,path.resolve(root,decision),task,ac)));
