import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalRoot } from "./full-lifecycle-lib.mjs";
import { discoveryProgress } from "./product-lib.mjs";

function main() {
  const report = discoveryProgress(canonicalRoot);
  console.log(JSON.stringify(report, null, 2));
  if (report.state === "missing") process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
