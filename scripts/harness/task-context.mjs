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
          DESIGNING: "Refine brief/acceptance/design/test-plan, confirm scope, then approve the design baseline.",
          DEVELOPING: "Implement only the approved design baseline and record implementation evidence.",
          VERIFYING: "Run required checks and record evidence bound to the verified HEAD.",
          REVIEWING: "Perform independent review; resolve findings without silently changing design.",
          DEPLOY_READY: "Use the existing release/operations gates or complete the task when appropriate.",
        }[status] ?? "Inspect the active spec and status.",
};

console.log(JSON.stringify(result, null, 2));
