import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readActive, specPaths, validateCompletion } from "./lifecycle-gates.mjs";
import { localDate } from "./time.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
try {
  const active = readActive(repoRoot);
  if (active.activeSpec === "none") throw new Error("No active task.");
  if (active.status !== "DEPLOY_READY") throw new Error(`Task ${active.activeSpec} is ${active.status}; completion requires DEPLOY_READY.`);
  const paths = specPaths(repoRoot, active.activeSpec);
  const required = [paths.brief, paths.acceptance, (fs.existsSync(paths.design) ? paths.design : paths.legacyPlan), paths.testPlan, paths.review, paths.delegation, paths.gatePath];
  const missing = required.filter((file) => !fs.existsSync(file));
  if (missing.length) throw new Error(`Missing required files: ${missing.map((f) => path.basename(f)).join(", ")}`);
  const gate = validateCompletion(repoRoot, active.activeSpec);
  const today = localDate();
  fs.writeFileSync(
    path.join(paths.specDir, "DONE.md"),
    [
      `# ${active.activeSpec} completed`,
      "",
      `- Completed: ${today}`,
      "- Previous status: DEPLOY_READY",
      `- Release mode: ${gate.releaseApproval.mode}`,
      `- Approved by: ${gate.releaseApproval.approvedBy}`,
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(active.activePath, ["---", "active_spec: none", "status: DESIGNING", `updated_at: ${today}`, "---", "", `Last completed task: \`${active.activeSpec}\``, ""].join("\n"), "utf8");
  console.log(JSON.stringify({ completed: active.activeSpec, marker: `docs/specs/${active.activeSpec}/DONE.md`, activeSpec: "none" }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
