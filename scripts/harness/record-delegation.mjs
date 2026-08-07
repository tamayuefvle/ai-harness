import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { utcTimestamp } from "./time.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const [role, decision, target = "-", sandbox = "-", reason = "-", report = "-"] =
  process.argv.slice(2);

if (!role || !decision) {
  console.error("Usage: node record-delegation.mjs <role> <decision> [target] [sandbox] [reason] [report]");
  process.exit(1);
}

const activePath = path.join(repoRoot, "docs/specs/_active.md");
const activeText = fs.readFileSync(activePath, "utf8");
const activeSpec = activeText.match(/active_spec:\s*(\S+)/)?.[1] ?? "none";

if (activeSpec === "none") {
  console.error("No active task.");
  process.exit(1);
}

const delegationPath = path.join(repoRoot, "docs/specs", activeSpec, "delegation.md");
if (!fs.existsSync(delegationPath)) {
  console.error(`Missing: docs/specs/${activeSpec}/delegation.md`);
  process.exit(1);
}

const now = utcTimestamp();
const clean = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const row = `| ${clean(now)} | ${clean(role)} | ${clean(decision)} | ${clean(target)} | ${clean(sandbox)} | ${clean(reason)} | ${clean(report)} |\n`;
fs.appendFileSync(delegationPath, row, "utf8");

const runtimeDir = path.join(repoRoot, ".harness", "reports");
fs.mkdirSync(runtimeDir, { recursive: true });
fs.appendFileSync(
  path.join(runtimeDir, "codex-runs.jsonl"),
  JSON.stringify({ time: now, activeSpec, role, decision, target, sandbox, reason, report }) + "\n",
  "utf8",
);

console.log(`Recorded ${role}/${decision} for ${activeSpec}.`);
