import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectCursorPreflight } from "./cursor-lib.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const report=collectCursorPreflight(root);
if(process.argv.includes("--json")) console.log(JSON.stringify(report,null,2));
else { console.log("Cursor CLI preflight\n"); for(const item of report.checks) console.log(`[${item.status.toUpperCase()}] ${item.name}: ${item.detail}`); if(report.reasonCode) console.log(`reasonCode: ${report.reasonCode}`); }
process.exitCode=report.status==="pass"?0:1;
