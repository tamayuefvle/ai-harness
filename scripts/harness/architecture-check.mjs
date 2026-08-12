import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalRoot } from "./full-lifecycle-lib.mjs";
import { readProject } from "./product-lib.mjs";
import { architectureCheckApplicable, validateArchitectureDocuments } from "./design-lib.mjs";

export function runArchitectureCheck(repoRoot = canonicalRoot, options = {}) {
  const project = readProject(repoRoot);
  if (options.ifApplicable && !architectureCheckApplicable(project)) {
    return { status: "skipped", reason: `project state ${project?.state ?? "missing"}` };
  }
  if (!project && !options.strict) {
    throw new Error("harness/project.json is missing.");
  }
  if (["MIGRATION_PENDING", "DISCOVERY", "PRODUCT_APPROVED"].includes(project?.state) && !options.forGate && !options.strict) {
    return { status: "skipped", reason: project.state };
  }
  const result = validateArchitectureDocuments(repoRoot);
  if (result.ok) return { status: "passed", warnings: result.warnings };
  const error = new Error("Architecture design contract violations");
  error.details = result.errors;
  throw error;
}

function main() {
  const args = new Set(process.argv.slice(2));
  try {
    const outcome = runArchitectureCheck(canonicalRoot, {
      ifApplicable: args.has("--if-applicable"),
      strict: args.has("--strict"),
      forGate: args.has("--for-gate"),
    });
    if (outcome.status === "skipped") {
      console.log(`[SKIP] architecture:check not applicable (${outcome.reason}).`);
      return;
    }
    console.log("[PASS] Architecture design documents satisfy semantic contract.");
    for (const warning of outcome.warnings ?? []) console.log(`[WARN] ${warning}`);
  } catch (error) {
    if (error.details) {
      console.error("[FAIL] Architecture design contract violations:");
      for (const detail of error.details) console.error(`- ${detail}`);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
