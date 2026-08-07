import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const EXPECTED_FALLBACK_VERSION = "0.7.7";
const MODES = new Set(["staged", "changed", "full", "design"]);
const BLOCKING_LEVELS = new Set(["none", "error", "warning"]);
const SOURCE_PATTERN = /\.(?:[cm]?[jt]sx?|html)$/i;
const CONFIG_PATTERN = /(?:^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|doctor\.config\.(?:[cm]?[jt]s|jsonc?)|(?:eslint|oxlint)\.config\.(?:[cm]?[jt]s|json)|\.eslintrc\.json|tsconfig(?:\.[^/]+)?\.json|next\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s)$/i;
const REACT_PACKAGES = new Set(["react", "react-dom", "next", "react-native", "expo", "preact"]);
const SKIP_DIRECTORIES = new Set([
  ".git",
  ".harness",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(here, "../..");

function parseArgs(argv) {
  const [mode = "changed", ...rest] = argv;
  if (!MODES.has(mode)) {
    throw new Error(`Usage: node scripts/harness/react-doctor.mjs <${[...MODES].join("|")}> [--base <ref>] [--blocking <level>] [--report <path>] [--max-duration <seconds>]`);
  }

  const options = { mode, base: null, blocking: null, report: null, maxDuration: null };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === "--base" && value) {
      options.base = value;
      index += 1;
    } else if (token === "--blocking" && value && BLOCKING_LEVELS.has(value)) {
      options.blocking = value;
      index += 1;
    } else if (token === "--report" && value) {
      options.report = value;
      index += 1;
    } else if (token === "--max-duration" && value && /^\d+$/.test(value) && Number(value) > 0) {
      options.maxDuration = Number(value);
      index += 1;
    } else {
      throw new Error(`Unknown or invalid option: ${token}`);
    }
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function expectedVersion(repoRoot) {
  const fragment = path.join(repoRoot, "package.devDependencies.fragment.json");
  try {
    const version = readJson(fragment)?.devDependencies?.["react-doctor"];
    return typeof version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)
      ? version
      : EXPECTED_FALLBACK_VERSION;
  } catch {
    return EXPECTED_FALLBACK_VERSION;
  }
}

function relative(repoRoot, target) {
  return path.relative(repoRoot, target).split(path.sep).join("/") || ".";
}

function atomicWriteJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
    timeout: options.timeout,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
}

function git(repoRoot, args) {
  const result = run("git", args, { cwd: repoRoot, timeout: 10_000 });
  if (result.status !== 0) return null;
  return (result.stdout ?? "").trim();
}

function isGitRepository(repoRoot) {
  return git(repoRoot, ["rev-parse", "--is-inside-work-tree"]) === "true";
}

function gitHead(repoRoot) {
  return git(repoRoot, ["rev-parse", "HEAD"]);
}

function normalizeCommit(repoRoot, ref) {
  if (!ref || /^0{40}$/.test(ref)) return null;
  return git(repoRoot, ["rev-parse", "--verify", `${ref}^{commit}`]);
}

function resolveBase(repoRoot, explicitBase) {
  const candidates = [];
  const add = (candidate) => {
    if (candidate && !/^0{40}$/.test(candidate) && !candidates.includes(candidate)) candidates.push(candidate);
  };

  add(explicitBase);
  add(process.env.REACT_DOCTOR_BASE);
  if (process.env.GITHUB_EVENT_NAME === "push") add(process.env.GITHUB_EVENT_BEFORE);

  if (process.env.GITHUB_BASE_REF) {
    add(`origin/${process.env.GITHUB_BASE_REF}`);
    add(process.env.GITHUB_BASE_REF);
  }

  add("origin/main");
  add("origin/master");
  add("main");
  add("master");

  for (const candidate of candidates) {
    const commit = normalizeCommit(repoRoot, candidate);
    if (commit) return commit;
  }
  return null;
}

function splitLines(value) {
  return (value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function changedFiles(repoRoot, mode, base) {
  if (!isGitRepository(repoRoot)) return [];
  if (mode === "staged") {
    return splitLines(git(repoRoot, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]));
  }
  if (mode === "full" || mode === "design") return [];

  const files = new Set();
  if (base) {
    for (const file of splitLines(git(repoRoot, ["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]))) files.add(file);
  }
  for (const file of splitLines(git(repoRoot, ["diff", "--name-only", "--diff-filter=ACMR"]))) files.add(file);
  for (const file of splitLines(git(repoRoot, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]))) files.add(file);
  for (const file of splitLines(git(repoRoot, ["ls-files", "--others", "--exclude-standard"]))) files.add(file);
  return [...files].sort();
}

export function findReactManifests(repoRoot) {
  const manifests = [];
  const stack = [repoRoot];

  while (stack.length > 0) {
    const directory = stack.pop();

    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) stack.push(target);
        continue;
      }
      if (!entry.isFile() || entry.name !== "package.json") continue;

      try {
        const manifest = readJson(target);
        const dependencies = {
          ...(manifest.dependencies ?? {}),
          ...(manifest.devDependencies ?? {}),
          ...(manifest.peerDependencies ?? {}),
          ...(manifest.optionalDependencies ?? {}),
        };
        if (Object.keys(dependencies).some((name) => REACT_PACKAGES.has(name))) {
          manifests.push(relative(repoRoot, target));
        }
      } catch {
        // Invalid package manifests are diagnosed by the normal repository checks.
      }
    }
  }

  return manifests.sort();
}

export function isRelevantReactFile(file) {
  return SOURCE_PATTERN.test(file) || CONFIG_PATTERN.test(file);
}

function activeSpec(repoRoot) {
  try {
    const text = fs.readFileSync(path.join(repoRoot, "docs/specs/_active.md"), "utf8");
    return text.match(/active_spec:\s*(\S+)/)?.[1] ?? "none";
  } catch {
    return "none";
  }
}

function defaultReportPath(repoRoot, spec, mode) {
  const scope = spec === "none" ? "unscoped" : spec;
  return path.join(repoRoot, ".harness", "reports", scope, `react-doctor-${mode}.json`);
}

function rawReportPath(reportPath) {
  return reportPath.endsWith(".json")
    ? reportPath.replace(/\.json$/, ".raw.json")
    : `${reportPath}.raw.json`;
}

function resolveCli(repoRoot) {
  const configured = process.env.REACT_DOCTOR_BIN;
  const local = process.platform === "win32"
    ? path.join(repoRoot, "node_modules", ".bin", "react-doctor.cmd")
    : path.join(repoRoot, "node_modules", ".bin", "react-doctor");
  const target = configured
    ? (path.isAbsolute(configured) ? configured : path.resolve(repoRoot, configured))
    : local;
  if (!fs.existsSync(target)) return null;

  if (/\.(?:mjs|cjs|js)$/i.test(target)) {
    return { command: process.execPath, prefix: [target], display: ["node", relative(repoRoot, target)] };
  }
  return { command: target, prefix: [], display: [relative(repoRoot, target)] };
}

function parseVersion(value) {
  return value.match(/\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/)?.[1] ?? null;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function hasPartialMarker(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) return false;
  for (const [key, inner] of Object.entries(value)) {
    if (["partial", "isPartial", "truncated", "timedOut"].includes(key) && inner === true) return true;
    if (hasPartialMarker(inner, depth + 1)) return true;
  }
  return false;
}

function inspectRawReport(raw, expected, mode) {
  const emptyContract = {
    schema_version: null,
    mode: null,
    react_detected: null,
    baseline_degraded: null,
    project_count: null,
    incomplete_project_count: null,
  };
  const invalid = (reason) => ({
    valid: false,
    reason,
    counts: { errors: null, warnings: null },
    contract: emptyContract,
    hardFailure: false,
    partial: false,
  });

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid("invalid-json-report-shape");
  if (raw.schemaVersion !== 3) return invalid("unsupported-json-schema-version");
  if (raw.version !== expected) return invalid("json-tool-version-mismatch");
  if (typeof raw.ok !== "boolean") return invalid("invalid-json-ok-field");
  if (!Array.isArray(raw.projects) || !Array.isArray(raw.diagnostics)) {
    return invalid("invalid-json-project-or-diagnostic-list");
  }
  if (!raw.summary || typeof raw.summary !== "object") return invalid("invalid-json-summary");

  const summaryFields = ["errorCount", "warningCount", "affectedFileCount", "totalDiagnosticCount"];
  if (summaryFields.some((field) => !isNonNegativeInteger(raw.summary[field]))) {
    return invalid("invalid-json-summary-counts");
  }
  if (!raw.diagnostics.every((diagnostic) => diagnostic && typeof diagnostic === "object" && ["error", "warning"].includes(diagnostic.severity))) {
    return invalid("invalid-json-diagnostic-severity");
  }

  const diagnosticErrors = raw.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const diagnosticWarnings = raw.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  if (
    diagnosticErrors !== raw.summary.errorCount
    || diagnosticWarnings !== raw.summary.warningCount
    || raw.diagnostics.length !== raw.summary.totalDiagnosticCount
  ) {
    return invalid("json-summary-diagnostic-count-mismatch");
  }

  const expectedModes = mode === "changed"
    ? new Set(["baseline", "diff"])
    : mode === "staged"
      ? new Set(["staged"])
      : new Set(["full"]);
  if (!expectedModes.has(raw.mode)) return invalid("json-mode-scope-mismatch");
  if (!raw.projects.every((project) => (
    project
    && typeof project === "object"
    && typeof project.packageRoot === "string"
    && typeof project.framework === "string"
    && typeof project.complete === "boolean"
    && Array.isArray(project.analyzedFiles)
    && isNonNegativeInteger(project.analyzedFileCount)
    && project.analyzedFileCount === project.analyzedFiles.length
  ))) {
    return invalid("invalid-json-project-coverage");
  }

  const incompleteProjectCount = raw.projects.filter((project) => !project.complete).length;
  const contract = {
    schema_version: raw.schemaVersion,
    mode: raw.mode,
    react_detected: typeof raw.reactDetected === "boolean" ? raw.reactDetected : null,
    baseline_degraded: typeof raw.baselineDegraded === "boolean" ? raw.baselineDegraded : null,
    project_count: raw.projects.length,
    incomplete_project_count: incompleteProjectCount,
  };
  const counts = {
    errors: raw.summary.errorCount,
    warnings: raw.summary.warningCount,
  };

  if (raw.error != null || raw.ok === false) {
    return { valid: true, reason: "react-doctor-reported-hard-failure", counts, contract, hardFailure: true, partial: false };
  }
  if (raw.reactDetected === false) {
    return { valid: true, reason: "react-runtime-not-detected", counts, contract, hardFailure: true, partial: false };
  }
  if (raw.projects.length === 0) {
    return { valid: true, reason: "react-doctor-returned-no-projects", counts, contract, hardFailure: true, partial: false };
  }
  if (mode === "changed" && raw.baselineDegraded === true) {
    return { valid: true, reason: "react-doctor-baseline-degraded", counts, contract, hardFailure: true, partial: false };
  }
  if (incompleteProjectCount > 0 || hasPartialMarker(raw)) {
    return { valid: true, reason: "react-doctor-partial-result", counts, contract, hardFailure: false, partial: true };
  }

  return { valid: true, reason: null, counts, contract, hardFailure: false, partial: false };
}

function excerpt(value) {
  const text = value ?? "";
  return text.length <= 4000 ? text : `${text.slice(0, 4000)}\n...[truncated]`;
}

function buildRunSettings(mode, options) {
  if (mode === "staged") {
    return { scope: "files", blocking: options.blocking ?? "none", maxDuration: options.maxDuration ?? 45 };
  }
  if (mode === "changed") {
    return { scope: "changed", blocking: options.blocking ?? "error", maxDuration: options.maxDuration ?? 120 };
  }
  return { scope: "full", blocking: options.blocking ?? "none", maxDuration: options.maxDuration ?? 180 };
}

function finishReport({
  repoRoot,
  reportPath,
  startedAt,
  expected,
  toolVersion,
  mode,
  settings,
  base,
  spec,
  head,
  command,
  manifests,
  files,
  relevant,
  status,
  exitCode,
  signal,
  reason,
  counts,
  rawPath,
  stdout,
  stderr,
  rawContract = {
    schema_version: null,
    mode: null,
    react_detected: null,
    baseline_degraded: null,
    project_count: null,
    incomplete_project_count: null,
  },
}) {
  const finishedAt = new Date();
  const report = {
    schema_version: "1.0.0",
    tool: {
      name: "react-doctor",
      version: toolVersion,
      expected_version: expected,
    },
    run: {
      mode,
      scope: settings.scope,
      blocking: settings.blocking,
      base,
      active_spec: spec,
      git_head: head,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      command,
    },
    trigger: {
      react_manifests: manifests,
      changed_files: files,
      relevant_files: relevant,
    },
    result: {
      status,
      exit_code: exitCode,
      signal,
      reason,
      counts,
      raw_contract: rawContract,
      raw_report_path: rawPath && fs.existsSync(rawPath) ? relative(repoRoot, rawPath) : null,
      stdout_excerpt: excerpt(stdout),
      stderr_excerpt: excerpt(stderr),
    },
  };
  atomicWriteJson(reportPath, report);
  return report;
}

function printOutcome(reportPath, repoRoot, report) {
  const location = relative(repoRoot, reportPath);
  const reason = report.result.reason ? ` (${report.result.reason})` : "";
  console.log(`React Doctor ${report.run.mode}: ${report.result.status}${reason}`);
  console.log(`Report: ${location}`);
}

export function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  const repoRoot = path.resolve(process.env.REACT_DOCTOR_REPO_ROOT ?? defaultRepoRoot);
  const startedAt = new Date();
  const expected = expectedVersion(repoRoot);
  const spec = activeSpec(repoRoot);
  const reportPath = options.report
    ? (path.isAbsolute(options.report) ? options.report : path.resolve(repoRoot, options.report))
    : defaultReportPath(repoRoot, spec, options.mode);
  const rawPath = rawReportPath(reportPath);
  const settings = buildRunSettings(options.mode, options);
  const inGit = isGitRepository(repoRoot);
  const head = inGit ? gitHead(repoRoot) : null;
  const base = inGit && options.mode === "changed" ? resolveBase(repoRoot, options.base) : null;
  const manifests = findReactManifests(repoRoot);
  const files = changedFiles(repoRoot, options.mode, base);
  const relevant = files.filter(isRelevantReactFile);

  const skipped = (reason) => {
    const report = finishReport({
      repoRoot,
      reportPath,
      startedAt,
      expected,
      toolVersion: null,
      mode: options.mode,
      settings,
      base,
      spec,
      head,
      command: [],
      manifests,
      files,
      relevant,
      status: "skipped",
      exitCode: 0,
      signal: null,
      reason,
      counts: { errors: null, warnings: null },
      rawPath: null,
      stdout: "",
      stderr: "",
    });
    printOutcome(reportPath, repoRoot, report);
    return 0;
  };

  if (manifests.length === 0) return skipped("no-react-project-detected");
  if ((options.mode === "staged" || options.mode === "changed") && !inGit) {
    return skipped("not-a-git-worktree");
  }
  if ((options.mode === "staged" || options.mode === "changed") && relevant.length === 0) {
    return skipped("no-react-relevant-changes");
  }
  if (options.mode === "changed" && process.env.CI === "true" && !base) {
    const report = finishReport({
      repoRoot,
      reportPath,
      startedAt,
      expected,
      toolVersion: null,
      mode: options.mode,
      settings,
      base,
      spec,
      head,
      command: [],
      manifests,
      files,
      relevant,
      status: "failed",
      exitCode: 1,
      signal: null,
      reason: "comparison-base-unresolved",
      counts: { errors: null, warnings: null },
      rawPath: null,
      stdout: "",
      stderr: "Fetch full git history or set REACT_DOCTOR_BASE to a valid commit or branch.",
    });
    printOutcome(reportPath, repoRoot, report);
    return 1;
  }

  const cli = resolveCli(repoRoot);
  if (!cli) {
    const report = finishReport({
      repoRoot,
      reportPath,
      startedAt,
      expected,
      toolVersion: null,
      mode: options.mode,
      settings,
      base,
      spec,
      head,
      command: [],
      manifests,
      files,
      relevant,
      status: "failed",
      exitCode: 1,
      signal: null,
      reason: "react-doctor-cli-not-installed",
      counts: { errors: null, warnings: null },
      rawPath: null,
      stdout: "",
      stderr: `Install the exact development dependency: npm install --save-dev --save-exact react-doctor@${expected}`,
    });
    printOutcome(reportPath, repoRoot, report);
    return 1;
  }

  const versionResult = run(cli.command, [...cli.prefix, "--version"], { cwd: repoRoot, timeout: 15_000 });
  const toolVersion = parseVersion(`${versionResult.stdout ?? ""}\n${versionResult.stderr ?? ""}`);
  if (versionResult.status !== 0 || toolVersion !== expected) {
    const report = finishReport({
      repoRoot,
      reportPath,
      startedAt,
      expected,
      toolVersion,
      mode: options.mode,
      settings,
      base,
      spec,
      head,
      command: [...cli.display, "--version"],
      manifests,
      files,
      relevant,
      status: "failed",
      exitCode: versionResult.status,
      signal: versionResult.signal ?? null,
      reason: toolVersion ? "react-doctor-version-mismatch" : "react-doctor-version-unreadable",
      counts: { errors: null, warnings: null },
      rawPath: null,
      stdout: versionResult.stdout ?? "",
      stderr: versionResult.stderr ?? "",
    });
    printOutcome(reportPath, repoRoot, report);
    return 1;
  }

  fs.mkdirSync(path.dirname(rawPath), { recursive: true });
  try {
    fs.rmSync(rawPath, { force: true });
  } catch (error) {
    const report = finishReport({
      repoRoot,
      reportPath,
      startedAt,
      expected,
      toolVersion,
      mode: options.mode,
      settings,
      base,
      spec,
      head,
      command: [],
      manifests,
      files,
      relevant,
      status: "failed",
      exitCode: 1,
      signal: null,
      reason: "stale-raw-report-removal-failed",
      counts: { errors: null, warnings: null },
      rawPath: null,
      stdout: "",
      stderr: `${error.name}: ${error.message}`,
    });
    printOutcome(reportPath, repoRoot, report);
    return 1;
  }

  const cliArgs = [
    ".",
    "--yes",
    "--json",
    "--json-compact",
    "--json-out",
    rawPath,
    "--no-score",
    "--no-telemetry",
    "--no-color",
    "--no-supply-chain",
    "--max-duration",
    String(settings.maxDuration),
    "--blocking",
    settings.blocking,
  ];

  if (options.mode === "staged") {
    cliArgs.push("--staged", "--scope", "files");
  } else if (options.mode === "changed") {
    cliArgs.push("--scope", "changed");
    if (base) cliArgs.push("--base", base);
    cliArgs.push("--include-untracked");
  } else {
    cliArgs.push("--scope", "full");
    if (options.mode === "design") cliArgs.push("--no-respect-inline-disables");
  }

  const command = [...cli.display, ...cliArgs.map((value) => value === rawPath ? relative(repoRoot, value) : value)];
  const scanResult = run(cli.command, [...cli.prefix, ...cliArgs], {
    cwd: repoRoot,
    timeout: (settings.maxDuration + 30) * 1000,
    env: {
      ...process.env,
      NO_COLOR: "1",
      REACT_DOCTOR_NO_TELEMETRY: "1",
    },
  });

  let raw = null;
  let parseError = null;
  try {
    if (fs.existsSync(rawPath)) {
      raw = readJson(rawPath);
    } else if ((scanResult.stdout ?? "").trim()) {
      raw = JSON.parse(scanResult.stdout.trim());
      atomicWriteJson(rawPath, raw);
    } else {
      throw new Error("React Doctor produced no JSON report.");
    }
  } catch (error) {
    parseError = error;
  }

  const inspection = raw
    ? inspectRawReport(raw, expected, options.mode)
    : {
      valid: false,
      reason: "invalid-or-missing-json-report",
      counts: { errors: null, warnings: null },
      contract: {
        schema_version: null,
        mode: null,
        react_detected: null,
        baseline_degraded: null,
        project_count: null,
        incomplete_project_count: null,
      },
      hardFailure: false,
      partial: false,
    };
  const counts = inspection.counts;
  let status = "passed";
  let reason = null;

  if (scanResult.error?.code === "ETIMEDOUT") {
    status = "failed";
    reason = "wrapper-timeout";
  } else if (parseError) {
    status = "failed";
    reason = "invalid-or-missing-json-report";
  } else if (!inspection.valid) {
    status = "failed";
    reason = inspection.reason;
  } else if (inspection.hardFailure) {
    status = "failed";
    reason = inspection.reason;
  } else if (inspection.partial) {
    status = "partial";
    reason = inspection.reason;
  } else if ((scanResult.status ?? 1) !== 0) {
    const hasBlockingFindings = settings.blocking === "warning"
      ? (counts.errors ?? 0) > 0 || (counts.warnings ?? 0) > 0
      : settings.blocking === "error" && (counts.errors ?? 0) > 0;
    if (raw?.ok === true && hasBlockingFindings) {
      status = "blocked";
      reason = "blocking-findings";
    } else {
      status = "failed";
      reason = "react-doctor-nonzero-without-blocking-findings";
    }
  } else {
    const shouldHaveBlocked = settings.blocking === "warning"
      ? (counts.errors ?? 0) > 0 || (counts.warnings ?? 0) > 0
      : settings.blocking === "error" && (counts.errors ?? 0) > 0;
    if (shouldHaveBlocked) {
      status = "failed";
      reason = "react-doctor-blocking-contract-violation";
    }
  }

  const stderr = [
    scanResult.stderr ?? "",
    parseError ? `${parseError.name}: ${parseError.message}` : "",
  ].filter(Boolean).join("\n");

  const report = finishReport({
    repoRoot,
    reportPath,
    startedAt,
    expected,
    toolVersion,
    mode: options.mode,
    settings,
    base,
    spec,
    head,
    command,
    manifests,
    files,
    relevant,
    status,
    exitCode: scanResult.status,
    signal: scanResult.signal ?? null,
    reason,
    counts,
    rawPath,
    rawContract: inspection.contract,
    stdout: scanResult.stdout ?? "",
    stderr,
  });
  printOutcome(reportPath, repoRoot, report);

  return status === "passed" || status === "skipped" ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
