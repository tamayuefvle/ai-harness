import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const defaultRepoRoot = path.resolve(here, "../..");
const LOCKFILES = ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb"];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function assertFragmentShape(value, key, file) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${file} must contain a JSON object.`);
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== key || !value[key] || typeof value[key] !== "object" || Array.isArray(value[key])) {
    throw new Error(`${file} must contain only the top-level key ${key}.`);
  }
}

export function normalizePackageName(input) {
  let value = String(input ?? "").trim().toLowerCase();
  value = value.replace(/[^a-z0-9._-]+/g, "-").replace(/^[-._]+|[-._]+$/g, "").replace(/[-._]{2,}/g, "-");
  if (!value) value = "app";
  value = value.slice(0, 214).replace(/[-._]+$/g, "");
  return value || "app";
}

export function isValidPackageName(value) {
  if (typeof value !== "string" || !value || value.length > 214 || value !== value.toLowerCase()) return false;
  const segment = "[a-z0-9][a-z0-9._-]*";
  return new RegExp(`^(?:${segment}|@${segment}/${segment})$`).test(value);
}

function resolveGitRoot(repoRoot) {
  try {
    return path.resolve(execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim());
  } catch {
    throw new Error("Target directory is not a Git repository. Initialize/choose the repository before bootstrap.");
  }
}

function mergeGitignore(repoRoot, fragmentText, write) {
  const target = path.join(repoRoot, ".gitignore");
  const sourceLines = fragmentText.replace(/\r\n/g, "\n").split("\n");
  const existingText = fs.existsSync(target) ? fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") : "";
  const existing = new Set(existingText.split("\n"));
  const missing = sourceLines.filter((line) => line && !existing.has(line));
  if (!write || !missing.length) return { path: ".gitignore", addedLines: missing };
  const prefix = existingText && !existingText.endsWith("\n") ? "\n" : "";
  const separator = existingText.trim() ? "\n" : "";
  fs.appendFileSync(target, `${prefix}${separator}${missing.join("\n")}\n`);
  return { path: ".gitignore", addedLines: missing };
}

export function inspectNewRepository(repoRoot = defaultRepoRoot, options = {}) {
  repoRoot = path.resolve(repoRoot);
  const gitRoot = resolveGitRoot(repoRoot);
  if (gitRoot !== repoRoot) throw new Error(`Run bootstrap from the Git root. Git root is ${gitRoot}`);

  const required = ["package.scripts.fragment.json", "package.devDependencies.fragment.json", ".gitignore.harness-fragment", "AGENTS.md", "README_HARNESS.md"];
  const missingRequired = required.filter((file) => !fs.existsSync(path.join(repoRoot, file)));
  if (missingRequired.length) throw new Error(`Harness files are missing: ${missingRequired.join(", ")}`);

  const packagePath = path.join(repoRoot, "package.json");
  if (fs.existsSync(packagePath)) throw new Error("package.json already exists. Use the existing-repository merge procedure instead.");

  const presentLockfiles = LOCKFILES.filter((file) => fs.existsSync(path.join(repoRoot, file)));
  if (presentLockfiles.length) throw new Error(`package.json is absent but lockfile(s) exist: ${presentLockfiles.join(", ")}. Do not delete them automatically; resolve repository state first.`);

  if (!process.release?.lts && !options.allowNonLts) {
    throw new Error(`Node.js ${process.version} is not an LTS release. Activate an LTS Node.js runtime before bootstrap.`);
  }

  const scriptsFragment = readJson(path.join(repoRoot, "package.scripts.fragment.json"));
  const devDependenciesFragment = readJson(path.join(repoRoot, "package.devDependencies.fragment.json"));
  assertFragmentShape(scriptsFragment, "scripts", "package.scripts.fragment.json");
  assertFragmentShape(devDependenciesFragment, "devDependencies", "package.devDependencies.fragment.json");

  const requestedName = options.name ?? normalizePackageName(path.basename(repoRoot));
  if (!isValidPackageName(requestedName)) throw new Error(`Invalid npm package name: ${requestedName}`);

  return {
    repoRoot,
    node: process.version,
    nodeLts: process.release?.lts ?? null,
    packageName: requestedName,
    packageJson: {
      name: requestedName,
      version: "0.0.0",
      private: true,
      scripts: scriptsFragment.scripts,
      devDependencies: devDependenciesFragment.devDependencies,
    },
    gitignoreFragment: fs.readFileSync(path.join(repoRoot, ".gitignore.harness-fragment"), "utf8"),
  };
}

function writeJsonExclusive(file, value) {
  const fd = fs.openSync(file, "wx", 0o644);
  try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); }
  finally { fs.closeSync(fd); }
}

export function bootstrapNewRepository(repoRoot = defaultRepoRoot, options = {}) {
  const inspection = inspectNewRepository(repoRoot, options);
  const write = Boolean(options.write);
  const gitignore = mergeGitignore(inspection.repoRoot, inspection.gitignoreFragment, write);
  if (write) writeJsonExclusive(path.join(inspection.repoRoot, "package.json"), inspection.packageJson);
  return {
    mode: write ? "written" : "check-only",
    repoRoot: inspection.repoRoot,
    node: inspection.node,
    nodeLts: inspection.nodeLts,
    packageName: inspection.packageName,
    packageJsonPath: "package.json",
    gitignore,
    nextCommands: [
      "npm install",
      "npm run harness:generate",
      "npm run harness:install",
      "npm run verify:harness",
      "npm run harness:doctor",
      "npm run codex:preflight  # required before any ai:* command when Codex is used",
      "Review and approve product profiles before running npm run profile:resolve",
    ],
  };
}

function parseArgs(argv) {
  const options = { write: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write") options.write = true;
    else if (arg === "--check") options.write = false;
    else if (arg === "--name") {
      if (!argv[i + 1]) throw new Error("--name requires a value.");
      options.name = argv[++i];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = bootstrapNewRepository(defaultRepoRoot, options);
  console.log(JSON.stringify(result, null, 2));
  if (!options.write) console.log("Check only: no files were changed. Re-run with --write after reviewing the result.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`[FAIL] ${error.message}`); process.exitCode = 1; }
}
