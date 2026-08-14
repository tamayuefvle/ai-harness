import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalRoot } from "./full-lifecycle-lib.mjs";
import { readProject } from "./product-lib.mjs";
import { stackCheckApplicable, validateStackDocuments } from "./design-lib.mjs";

export function runStackCheck(repoRoot = canonicalRoot, options = {}) {
  const project = readProject(repoRoot);
  if (options.ifApplicable && !stackCheckApplicable(project)) {
    return { status: "skipped", reason: `project state ${project?.state ?? "missing"}` };
  }
  if (!project && !options.strict) {
    throw new Error("harness/project.json is missing.");
  }
  if (project?.state === "MIGRATION_PENDING" && !options.forGate && !options.strict) {
    return { status: "skipped", reason: "MIGRATION_PENDING" };
  }
  if (project?.state === "PLANNING" && !options.forGate && !options.strict) {
    return { status: "skipped", reason: "PLANNING" };
  }
  const result = validateStackDocuments(repoRoot);
  if (result.ok) return { status: "passed", warnings: result.warnings };
  const error = new Error("Stack design contract violations");
  error.details = result.errors;
  throw error;
}

function main() {
  const args = new Set(process.argv.slice(2));
  try {
    const outcome = runStackCheck(canonicalRoot, {
      ifApplicable: args.has("--if-applicable"),
      strict: args.has("--strict"),
      forGate: args.has("--for-gate"),
    });
    if (outcome.status === "skipped") {
      console.log(`[SKIP] stack:check not applicable (${outcome.reason}).`);
      return;
    }
    console.log("[PASS] Stack design documents satisfy semantic contract.");
    for (const warning of outcome.warnings ?? []) console.log(`[WARN] ${warning}`);
  } catch (error) {
    if (error.details) {
      console.error("[FAIL] Stack design contract violations:");
      for (const detail of error.details) console.error(`- ${detail}`);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
