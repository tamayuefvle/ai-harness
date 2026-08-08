import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const SECRET_PATTERNS = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private-key material"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/, "GitHub fine-grained token"],
  [/\bghp_[A-Za-z0-9]{20,}\b/, "GitHub classic token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, "API secret token"],
];

const executableExtensions = new Set([".sh", ".ps1", ".yml", ".yaml", ".mjs", ".js", ".cjs"]);
const executableSpecial = new Set([".githooks/pre-commit", ".githooks/pre-push"]);
const enforcementDefinitions = new Set([
  ".codex/hooks/pre_tool_use_policy.py",
  ".codex/rules/guardrails.rules",
  "scripts/harness/runtime-doctor.mjs",
  "scripts/harness/security-check.mjs",
]);

function dangerousPatterns() {
  const join = (...parts) => parts.join("\\s+");
  return [
    [new RegExp(join("git", "reset", "--hard"), "i"), "destructive Git reset"],
    [/git\s+clean\s+[^\n]*(?:-f|--force)/i, "forced Git clean"],
    [/git\s+push\s+[^\n]*(?:--force|-f)(?:\s|$)/i, "force push"],
    [/\brm\s+-[^\n\s]*r[^\n\s]*f|\brm\s+-[^\n\s]*f[^\n\s]*r/i, "recursive forced deletion"],
    [/(?:curl|wget)[^\n|]*\|\s*(?:ba)?sh(?:\s|$)/i, "remote script piped to shell"],
    [/\b(?:npx\s+)?vercel\b[^\n]*--prod(?:\s|$)/i, "direct production deploy"],
  ];
}

function normalizeInventoryEntry(value) {
  return value.trim().replaceAll("\\", "/");
}

export function loadInventory(repoRoot = defaultRepoRoot) {
  const inventoryPath = path.join(repoRoot, "FILE_INVENTORY.txt");
  if (!fs.existsSync(inventoryPath)) throw new Error("FILE_INVENTORY.txt is missing.");
  const entries = fs.readFileSync(inventoryPath, "utf8").split(/\r?\n/).map(normalizeInventoryEntry).filter(Boolean);
  if (!entries.length) throw new Error("FILE_INVENTORY.txt is empty.");
  return entries;
}

function resolveInventoryPath(repoRoot, relative) {
  if (path.isAbsolute(relative) || relative.split("/").includes("..")) {
    throw new Error(`Unsafe inventory path: ${relative}`);
  }
  const absolute = path.resolve(repoRoot, relative);
  const inside = path.relative(repoRoot, absolute);
  if (inside.startsWith("..") || path.isAbsolute(inside)) throw new Error(`Inventory path escapes repository: ${relative}`);
  return absolute;
}

function isExecutableCandidate(relative) {
  if (enforcementDefinitions.has(relative) || relative.endsWith(".test.mjs")) return false;
  if (executableSpecial.has(relative)) return true;
  if (relative.startsWith(".github/workflows/")) return true;
  if (!relative.startsWith("scripts/")) return false;
  return executableExtensions.has(path.extname(relative));
}

export function collectSecurityFindings(repoRoot = defaultRepoRoot, options = {}) {
  const inventory = options.inventory ?? loadInventory(repoRoot);
  const findings = [];
  const missing = [];
  const dangerous = dangerousPatterns();

  for (const relative of inventory) {
    let absolute;
    try {
      absolute = resolveInventoryPath(repoRoot, relative);
    } catch (error) {
      findings.push({ kind: "inventory-path", path: relative, detail: error.message });
      continue;
    }
    if (!fs.existsSync(absolute)) {
      missing.push(relative);
      continue;
    }
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      findings.push({ kind: "symlink", path: relative, detail: "Harness inventory entries must not be symbolic links." });
      continue;
    }
    if (!stat.isFile()) continue;

    const text = fs.readFileSync(absolute, "utf8");
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (pattern.test(text)) findings.push({ kind: "secret", path: relative, detail: label });
    }
    if (isExecutableCandidate(relative)) {
      for (const [pattern, label] of dangerous) {
        if (pattern.test(text)) findings.push({ kind: "dangerous-executable", path: relative, detail: label });
      }
    }
  }

  // The release gate must remain an approval boundary, not a deployment implementation.
  const releaseWorkflow = path.join(repoRoot, ".github/workflows/release-gate.yml");
  if (fs.existsSync(releaseWorkflow)) {
    const workflow = fs.readFileSync(releaseWorkflow, "utf8");
    if (!/^\s*environment:\s*production\s*$/m.test(workflow)) {
      findings.push({ kind: "release-gate", path: ".github/workflows/release-gate.yml", detail: "production Environment is not configured." });
    }
    if (/\b(?:npx\s+)?vercel\b[^\n]*--prod|\bdeploy(?:ment)?\s*:/i.test(workflow)) {
      findings.push({ kind: "release-gate", path: ".github/workflows/release-gate.yml", detail: "Release gate must not perform provider deployment." });
    }
  }

  return { inventoryCount: inventory.length, missing, findings };
}

function main() {
  let report;
  try {
    report = collectSecurityFindings();
  } catch (error) {
    console.error(`[FAIL] Security check could not run: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Harness security check: ${report.inventoryCount} inventory entries`);
  if (report.missing.length) {
    console.error(`[FAIL] Missing inventory entries (${report.missing.length}): ${report.missing.slice(0, 10).join(", ")}`);
  }
  for (const finding of report.findings) console.error(`[FAIL] ${finding.kind} ${finding.path}: ${finding.detail}`);
  if (!report.missing.length && !report.findings.length) console.log("[PASS] No symlink, high-confidence secret, prohibited executable pattern, or release-gate violation found.");
  process.exitCode = report.missing.length || report.findings.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

