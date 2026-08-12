import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalRoot, parseOptions } from "./full-lifecycle-lib.mjs";
import { designProgress, setDesignTier } from "./design-lib.mjs";

function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.tier) {
    setDesignTier(canonicalRoot, options.tier);
  }
  const report = designProgress(canonicalRoot);
  console.log(JSON.stringify(report, null, 2));
  if (report.state === "missing") process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
