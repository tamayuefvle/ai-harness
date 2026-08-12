import path from "node:path";
import { fileURLToPath } from "node:url";
import { writePolicyOutputs } from "./policy-lib.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const outputs=writePolicyOutputs(root);
console.log(`Generated ${outputs.size} policy projections.`);
