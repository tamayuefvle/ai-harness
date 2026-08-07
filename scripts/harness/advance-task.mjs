import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACTIVE_STATES, readActive, validateTransition } from "./lifecycle-gates.mjs";
import { localDate } from "./time.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const requested = process.argv[2];

if (!ACTIVE_STATES.includes(requested)) {
  console.error(`Allowed status: ${ACTIVE_STATES.join(", ")}`);
  process.exit(1);
}

try {
  const active = readActive(repoRoot);
  if (active.activeSpec === "none") throw new Error("No active task.");
  if (!ACTIVE_STATES.includes(active.status)) throw new Error(`Unknown current status: ${active.status}`);
  const currentIndex = ACTIVE_STATES.indexOf(active.status);
  const requestedIndex = ACTIVE_STATES.indexOf(requested);
  if (requestedIndex === currentIndex) {
    console.log(`Task ${active.activeSpec} is already ${active.status}.`);
    process.exit(0);
  }
  if (requestedIndex !== currentIndex + 1) {
    throw new Error(`Invalid transition: ${active.status} -> ${requested}. Expected: ${ACTIVE_STATES[currentIndex + 1] ?? "terminal completion"}`);
  }

  validateTransition(repoRoot, active.activeSpec, active.status, requested);
  const today = localDate();
  const text = active.text
    .replace(/status:\s*\S+/, `status: ${requested}`)
    .replace(/updated_at:\s*\S+/, `updated_at: ${today}`);
  fs.writeFileSync(active.activePath, text, "utf8");
  console.log(JSON.stringify({ activeSpec: active.activeSpec, previousStatus: active.status, status: requested }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
