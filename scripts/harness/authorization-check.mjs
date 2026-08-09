import path from "node:path";
import { fileURLToPath } from "node:url";
import { authorizeOperation, loadContracts } from "./execution-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }
const conditions = [];
for (let i = 0; i < process.argv.length; i += 1) if (process.argv[i] === "--condition" && process.argv[i + 1]) conditions.push(process.argv[i + 1]);
const request = { role: arg("--role"), capabilityId: arg("--capability"), providerId: arg("--provider"), operation: arg("--operation"), conditions };
if (Object.values(request).slice(0, 4).some((value) => !value)) {
  console.error("Usage: authorization:check --role <role> --capability <id> --provider <id> --operation <name> [--condition <condition>]...");
  process.exit(2);
}
const { authorization, capabilities } = loadContracts(root);
const result = authorizeOperation(authorization, capabilities, request);
console.log(JSON.stringify({ diagnosticOnly: true, note: "--condition values simulate already-verified facts; this command does not grant authority.", request, ...result }, null, 2));
process.exit(result.effect === "allow" ? 0 : 3);
