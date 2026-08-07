import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const activePath = path.join(repoRoot, "docs/specs/_active.md");

if (!fs.existsSync(activePath)) {
  console.error("docs/specs/_active.md does not exist.");
  process.exit(1);
}

const text = fs.readFileSync(activePath, "utf8");
const activeSpec = text.match(/active_spec:\s*(\S+)/)?.[1] ?? "none";
const status = text.match(/status:\s*(\S+)/)?.[1] ?? "UNKNOWN";

const result = {
  activeSpec,
  status,
  specPath: activeSpec === "none" ? null : `docs/specs/${activeSpec}`,
  nextExpected:
    activeSpec === "none"
      ? "Start a new task or answer without changing the repository."
      : {
          IDEA: "Complete brief.md and acceptance.md, then obtain human confirmation.",
          SPEC_READY: "Complete plan.md and test-plan.md, plus any required ADR.",
          PLAN_READY: "Implement one acceptance criterion at a time.",
          IMPLEMENTING: "Finish scoped implementation and enter verification.",
          VERIFYING: "Run required checks and record evidence.",
          REVIEW_READY: "Resolve review findings and prepare Preview.",
          DEPLOY_READY: "Obtain explicit human production approval or complete the task.",
        }[status] ?? "Inspect the active spec and status.",
};

console.log(JSON.stringify(result, null, 2));
