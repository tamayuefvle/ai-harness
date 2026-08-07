import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const phase = process.argv[2];

if (!["research", "implementation", "review"].includes(phase)) {
  console.error("Usage: npm run ai:decide -- research|implementation|review");
  process.exit(1);
}

const activePath = path.join(repoRoot, "docs/specs/_active.md");
const activeText = fs.readFileSync(activePath, "utf8");
const activeSpec = activeText.match(/active_spec:\s*(\S+)/)?.[1] ?? "none";
const status = activeText.match(/status:\s*(\S+)/)?.[1] ?? "UNKNOWN";

if (activeSpec === "none") {
  console.log(JSON.stringify({
    phase, activeSpec, status, decision: "blocked",
    reasons: ["No active specification."], command: null,
  }, null, 2));
  process.exit(0);
}

const specDir = path.join(repoRoot, "docs/specs", activeSpec);
const readIfExists = (name) => {
  const target = path.join(specDir, name);
  return fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
};

const brief = readIfExists("brief.md");
const acceptance = readIfExists("acceptance.md");
const plan = readIfExists("plan.md");
const combined = `${brief}\n${acceptance}\n${plan}`;

const pathMatches = [...combined.matchAll(/`([^`\n]+\.[a-zA-Z0-9]+)`/g)]
  .map((match) => match[1])
  .filter((value) => !value.includes(" "));
const uniquePaths = [...new Set(pathMatches)];

const roots = new Set();
for (const file of uniquePaths) {
  const normalized = file.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments[0] === "src" && segments[1]) roots.add(`src/${segments[1]}`);
  else roots.add(segments[0]);
}

let changedFiles = [];
try {
  const output = execFileSync(
    "git", ["diff", "--name-only", "HEAD"],
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();
  changedFiles = output ? output.split("\n").filter(Boolean) : [];
} catch {
  changedFiles = [];
}

const runtimeChanged = changedFiles.some((file) =>
  /^(app|src|components|lib|content|styles|public|tests|e2e)\//.test(file) ||
  /^(package(-lock)?\.json|next\.config\.|tsconfig\.json)/.test(file)
);
const docsOnly = changedFiles.length > 0 && changedFiles.every((file) =>
  /^(docs\/|README|.*\.md$)/.test(file)
);

const flags = {
  architecture: /(ADR|architecture|dependency|package|CMS|database|auth|routing|route|Server Component|Client Component|外部サービス|技術選定)/i.test(combined),
  crossCutting: /(data|schema|type|component|test|e2e|metadata|responsive|accessibility|データ|型|コンポーネント|テスト)/i.test(combined),
  fineTuning: /(copy|wording|spacing|margin|padding|color|色|余白|文言|微調整)/i.test(combined),
  newRoute: /(new route|route追加|ページ追加|新規ページ|page\.tsx)/i.test(combined),
  external: /(API|external|third-party|外部サービス|Webhook|CMS)/i.test(combined),
};

let decision;
const reasons = [];
let command = null;

if (phase === "research") {
  if (!["SPEC_READY", "PLAN_READY"].includes(status)) {
    decision = "blocked";
    reasons.push(`Research is expected from SPEC_READY; current status is ${status}.`);
  } else {
    const score =
      (uniquePaths.length >= 5 ? 2 : 0) +
      (roots.size >= 2 ? 2 : 0) +
      (flags.architecture ? 2 : 0) +
      (flags.newRoute ? 1 : 0) +
      (flags.external ? 2 : 0) +
      (flags.crossCutting ? 1 : 0);

    if (flags.architecture || flags.external || score >= 5) decision = "required";
    else if (score >= 2 || uniquePaths.length === 0) decision = "recommended";
    else decision = "not_needed";

    reasons.push(`${uniquePaths.length} referenced file path(s), ${roots.size} role root(s).`);
    if (flags.architecture) reasons.push("Architecture or boundary decision detected.");
    if (flags.external) reasons.push("External service or integration detected.");
    if (uniquePaths.length === 0) reasons.push("Impact scope is not yet explicit.");
    command = decision === "not_needed" ? null : "npm run ai:research";
  }
}

if (phase === "implementation") {
  if (!["PLAN_READY", "IMPLEMENTING"].includes(status)) {
    decision = "blocked";
    reasons.push(`Implementation requires PLAN_READY or IMPLEMENTING; current status is ${status}.`);
  } else {
    const score =
      (uniquePaths.length >= 5 ? 2 : 0) +
      (roots.size >= 3 ? 2 : 0) +
      (flags.crossCutting ? 2 : 0) +
      (flags.architecture ? 1 : 0) +
      (flags.newRoute ? 1 : 0);

    if (flags.fineTuning && uniquePaths.length <= 3 && roots.size <= 1) {
      decision = "cursor_preferred";
      reasons.push("Local UI/copy fine tuning is better handled interactively in Cursor.");
    } else if (score >= 4) {
      decision = "recommended";
      reasons.push("Cross-file or cross-role consistency is likely required.");
    } else {
      decision = "cursor_preferred";
      reasons.push("The planned change appears local enough for Cursor.");
    }

    reasons.push(`${uniquePaths.length} planned file path(s), ${roots.size} role root(s).`);
    command = decision === "recommended" ? "npm run ai:implement -- AC-xxx" : null;
  }
}

if (phase === "review") {
  if (docsOnly && !runtimeChanged) {
    decision = "skippable";
    reasons.push("Only documentation or Markdown changes are detected.");
  } else {
    decision = "required";
    reasons.push(runtimeChanged
      ? "Runtime, configuration, test, or user-visible behavior changed."
      : "Change scope is uncertain; independent review is the safe default.");
    command = "npm run ai:review";
  }
}

console.log(JSON.stringify({
  phase, activeSpec, status, decision,
  metrics: {
    referencedFiles: uniquePaths.length,
    roleRoots: [...roots],
    changedFiles,
    flags,
  },
  reasons,
  command,
}, null, 2));
