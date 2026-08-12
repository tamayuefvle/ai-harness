import fs from "node:fs";
import path from "node:path";
import { assertNoLikelySecret, canonicalRoot, parseOptions, readJson, safeId } from "./full-lifecycle-lib.mjs";
import { loadSignalFeedbackContract } from "./product-lib.mjs";

const options = parseOptions(process.argv.slice(2));
const contract = loadSignalFeedbackContract(canonicalRoot);
const signalId = safeId(options.signal, new RegExp(`^${contract.patterns.signalId}$`), "signal id");
const affects = options.affects;
const action = (options.action ?? "").toLowerCase();
const summary = options.summary;

if (!affects || !summary) throw new Error("--affects and --summary are required");
if (!contract.actions.includes(action)) throw new Error(`Invalid --action (expected one of ${contract.actions.join(", ")})`);
assertNoLikelySecret(`${affects} ${summary}`);

readJson(path.join(canonicalRoot, contract.signalDirectory, `${signalId}.json`));

const feedbackPath = path.join(canonicalRoot, contract.feedbackDocument);
if (!fs.existsSync(feedbackPath)) {
  fs.mkdirSync(path.dirname(feedbackPath), { recursive: true });
  fs.writeFileSync(
    feedbackPath,
    `# Product signal feedback

<!-- Link operational signals to product trace ids. Each row must reference an existing signal record. -->

| Signal | Affects | Action | Summary |
|---|---|---|---|
`,
    "utf8",
  );
}

const row = `| ${signalId} | ${affects} | ${action} | ${summary} |\n`;
fs.appendFileSync(feedbackPath, row, "utf8");
console.log(JSON.stringify({ signalId, affects, action, summary, feedbackDocument: contract.feedbackDocument }, null, 2));
