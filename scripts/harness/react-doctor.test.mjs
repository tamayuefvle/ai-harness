import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.join(here, "react-doctor.mjs");

function command(commandName, args, cwd) {
  const result = spawnSync(commandName, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${commandName} ${args.join(" ")} failed: ${result.stderr}`);
  return (result.stdout ?? "").trim();
}

function createRepository({ react = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "react-doctor-harness-"));
  command("git", ["init", "-q", "-b", "feature/test"], root);
  command("git", ["config", "user.name", "Harness Test"], root);
  command("git", ["config", "user.email", "harness-test@example.invalid"], root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "fixture",
      private: true,
      dependencies: react ? { react: "19.0.0" } : { lodash: "4.17.21" },
    }, null, 2),
  );
  fs.writeFileSync(path.join(root, "src", "App.tsx"), "export const App = () => <main>Hello</main>;\n");
  command("git", ["add", "."], root);
  command("git", ["commit", "-q", "-m", "initial"], root);
  const initial = command("git", ["rev-parse", "HEAD"], root);
  return { root, initial };
}

function diagnostic(severity, index) {
  return {
    id: `${severity}-${index}`,
    normalizedFilePath: "src/App.tsx",
    filePath: "src/App.tsx",
    plugin: "react-doctor",
    rule: `fixture-${severity}-${index}`,
    severity,
    tags: [],
    message: "fixture diagnostic",
    help: "fixture help",
    line: index + 1,
    column: 1,
    category: "correctness",
  };
}

function fakeJson({
  ok = true,
  errors = 0,
  warnings = 0,
  complete = true,
  reactDetected = true,
  baselineDegraded,
  version = "0.7.7",
  schemaVersion = 3,
  mode = "baseline",
  exitError = null,
  projects = true,
  analyzedFileCount = 1,
  summaryOverride = {},
} = {}) {
  const diagnostics = [
    ...Array.from({ length: errors }, (_, index) => diagnostic("error", index)),
    ...Array.from({ length: warnings }, (_, index) => diagnostic("warning", index)),
  ];
  return JSON.stringify({
    schemaVersion,
    version,
    ok,
    directory: ".",
    mode,
    ...(baselineDegraded === undefined ? {} : { baselineDegraded }),
    reactDetected,
    diff: null,
    projects: projects ? [{
      directory: ".",
      packageRoot: ".",
      framework: "vite",
      project: {},
      diagnostics,
      score: null,
      skippedChecks: [],
      analyzedFiles: ["src/App.tsx"],
      analyzedFileCount,
      complete,
      elapsedMilliseconds: 1,
    }] : [],
    diagnostics,
    summary: {
      errorCount: errors,
      warningCount: warnings,
      affectedFileCount: diagnostics.length > 0 ? 1 : 0,
      totalDiagnosticCount: diagnostics.length,
      score: null,
      scoreLabel: null,
      ...summaryOverride,
    },
    elapsedMilliseconds: 1,
    error: exitError,
  });
}

function createFakeCli(root) {
  const fake = path.join(root, "fake-react-doctor.mjs");
  fs.writeFileSync(fake, `
import fs from "node:fs";
const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log(process.env.FAKE_VERSION ?? "0.7.7");
  process.exit(0);
}
if (process.env.FAKE_ARGS_FILE) fs.writeFileSync(process.env.FAKE_ARGS_FILE, JSON.stringify(args));
const outputIndex = args.indexOf("--json-out");
const output = outputIndex >= 0 ? args[outputIndex + 1] : null;
const mode = args.includes("--staged") ? "staged" : args.includes("changed") ? "baseline" : "full";
const defaultReport = {
  schemaVersion: 3,
  version: "0.7.7",
  ok: true,
  directory: ".",
  mode,
  reactDetected: true,
  diff: null,
  projects: [{
    directory: ".",
    packageRoot: ".",
    framework: "vite",
    project: {},
    diagnostics: [],
    score: null,
    skippedChecks: [],
    analyzedFiles: ["src/App.tsx"],
    analyzedFileCount: 1,
    complete: true,
    elapsedMilliseconds: 1,
  }],
  diagnostics: [],
  summary: {
    errorCount: 0,
    warningCount: 0,
    affectedFileCount: 0,
    totalDiagnosticCount: 0,
    score: null,
    scoreLabel: null,
  },
  elapsedMilliseconds: 1,
  error: null,
};
if (output) {
  fs.mkdirSync(new URL(".", "file://" + output).pathname, { recursive: true });
  fs.writeFileSync(output, process.env.FAKE_WRITE_INVALID === "1"
    ? "not-json"
    : (process.env.FAKE_JSON ?? JSON.stringify(defaultReport)));
}
process.exit(Number(process.env.FAKE_EXIT ?? "0"));
`, "utf8");
  return fake;
}

function runWrapper(root, fake, args, extraEnv = {}) {
  const report = path.join(root, "report.json");
  const result = spawnSync(process.execPath, [wrapper, ...args, "--report", report], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      REACT_DOCTOR_REPO_ROOT: root,
      REACT_DOCTOR_BIN: fake,
      ...extraEnv,
    },
  });
  return {
    result,
    report: fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, "utf8")) : null,
  };
}

function changeReactFile(root, marker = "changed") {
  fs.appendFileSync(path.join(root, "src", "App.tsx"), `// ${marker}\n`);
}

test("skips repositories without a React dependency", () => {
  const { root } = createRepository({ react: false });
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed"]);
  assert.equal(result.status, 0);
  assert.equal(report.result.status, "skipped");
  assert.equal(report.result.reason, "no-react-project-detected");
});

test("runs a staged advisory scan only for staged React files", () => {
  const { root } = createRepository();
  const fake = createFakeCli(root);
  const argsFile = path.join(root, "args.json");
  changeReactFile(root, "staged");
  command("git", ["add", "src/App.tsx"], root);
  const { result, report } = runWrapper(root, fake, ["staged"], { FAKE_ARGS_FILE: argsFile });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.result.status, "passed");
  assert.equal(report.result.raw_contract.schema_version, 3);
  assert.equal(report.result.raw_contract.mode, "staged");
  const args = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  assert.ok(args.includes("--staged"));
  assert.deepEqual(args.slice(args.indexOf("--scope"), args.indexOf("--scope") + 2), ["--scope", "files"]);
  assert.deepEqual(args.slice(args.indexOf("--blocking"), args.indexOf("--blocking") + 2), ["--blocking", "none"]);
});

test("propagates changed-scope blocking findings", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  const argsFile = path.join(root, "args.json");
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial], {
    FAKE_ARGS_FILE: argsFile,
    FAKE_EXIT: "1",
    FAKE_JSON: fakeJson({ errors: 1 }),
  });
  assert.equal(result.status, 1);
  assert.equal(report.result.status, "blocked");
  assert.equal(report.result.reason, "blocking-findings");
  assert.equal(report.result.counts.errors, 1);
  const args = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  assert.deepEqual(args.slice(args.indexOf("--scope"), args.indexOf("--scope") + 2), ["--scope", "changed"]);
  assert.deepEqual(args.slice(args.indexOf("--base"), args.indexOf("--base") + 2), ["--base", initial]);
  assert.ok(args.includes("--include-untracked"));
});

test("fails closed when JSON output is invalid", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial], { FAKE_WRITE_INVALID: "1" });
  assert.equal(result.status, 1);
  assert.equal(report.result.status, "failed");
  assert.equal(report.result.reason, "invalid-or-missing-json-report");
});

test("rejects a CLI version that differs from the pinned dependency", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial], { FAKE_VERSION: "0.7.6" });
  assert.equal(result.status, 1);
  assert.equal(report.result.status, "failed");
  assert.equal(report.result.reason, "react-doctor-version-mismatch");
});

test("fails closed in CI when no comparison base can be resolved", () => {
  const { root } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed"], { CI: "true" });
  assert.equal(result.status, 1);
  assert.equal(report.result.status, "failed");
  assert.equal(report.result.reason, "comparison-base-unresolved");
});

test("normalizes a branch comparison base to a commit SHA", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  const argsFile = path.join(root, "args.json");
  changeReactFile(root);
  const { result } = runWrapper(root, fake, ["changed", "--base", "feature/test"], { FAKE_ARGS_FILE: argsFile });
  assert.equal(result.status, 0, result.stderr);
  const args = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  assert.deepEqual(args.slice(args.indexOf("--base"), args.indexOf("--base") + 2), ["--base", initial]);
});

test("uses GITHUB_EVENT_BEFORE for push comparisons", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  const argsFile = path.join(root, "args.json");
  changeReactFile(root);
  const { result } = runWrapper(root, fake, ["changed"], { GITHUB_EVENT_NAME: "push", GITHUB_EVENT_BEFORE: initial, CI: "true", FAKE_ARGS_FILE: argsFile });
  assert.equal(result.status, 0, result.stderr);
  const args = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  assert.deepEqual(args.slice(args.indexOf("--base"), args.indexOf("--base") + 2), ["--base", initial]);
});

test("ignores an all-zero push before SHA", () => {
  const { root } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed"], { GITHUB_EVENT_NAME: "push", GITHUB_EVENT_BEFORE: "0".repeat(40), CI: "true" });
  assert.equal(result.status, 1);
  assert.equal(report.result.reason, "comparison-base-unresolved");
});

test("treats a nonzero exit without findings as a hard failure", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial], {
    FAKE_EXIT: "1",
    FAKE_JSON: fakeJson(),
  });
  assert.equal(result.status, 1);
  assert.equal(report.result.status, "failed");
  assert.equal(report.result.reason, "react-doctor-nonzero-without-blocking-findings");
});

test("fails instead of reusing a stale raw report that cannot be removed", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  fs.mkdirSync(path.join(root, "report.raw.json"));
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial]);
  assert.equal(result.status, 1);
  assert.equal(report.result.status, "failed");
  assert.equal(report.result.reason, "stale-raw-report-removal-failed");
});

test("marks incomplete project coverage as partial", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial], {
    FAKE_JSON: fakeJson({ complete: false }),
  });
  assert.equal(result.status, 1);
  assert.equal(report.result.status, "partial");
  assert.equal(report.result.reason, "react-doctor-partial-result");
  assert.equal(report.result.raw_contract.incomplete_project_count, 1);
});

test("fails when the raw report did not detect a React runtime", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial], {
    FAKE_JSON: fakeJson({ reactDetected: false }),
  });
  assert.equal(result.status, 1);
  assert.equal(report.result.status, "failed");
  assert.equal(report.result.reason, "react-runtime-not-detected");
});

test("fails a degraded changed baseline", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial], {
    FAKE_JSON: fakeJson({ baselineDegraded: true, mode: "diff" }),
  });
  assert.equal(result.status, 1);
  assert.equal(report.result.status, "failed");
  assert.equal(report.result.reason, "react-doctor-baseline-degraded");
});

test("rejects unsupported raw JSON schema versions", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial], {
    FAKE_JSON: fakeJson({ schemaVersion: 2 }),
  });
  assert.equal(result.status, 1);
  assert.equal(report.result.reason, "unsupported-json-schema-version");
});

test("rejects raw reports from a different tool version", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial], {
    FAKE_JSON: fakeJson({ version: "0.7.6" }),
  });
  assert.equal(result.status, 1);
  assert.equal(report.result.reason, "json-tool-version-mismatch");
});



test("rejects a raw mode that does not match the requested scope", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial], {
    FAKE_JSON: fakeJson({ mode: "full" }),
  });
  assert.equal(result.status, 1);
  assert.equal(report.result.reason, "json-mode-scope-mismatch");
});

test("resolves relative CLI and report paths from the repository root", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const nested = path.join(root, "src");
  const report = path.join(root, "evidence", "react-doctor.json");
  const result = spawnSync(process.execPath, [wrapper, "changed", "--base", initial, "--report", "evidence/react-doctor.json"], {
    cwd: nested,
    encoding: "utf8",
    env: {
      ...process.env,
      REACT_DOCTOR_REPO_ROOT: root,
      REACT_DOCTOR_BIN: "fake-react-doctor.mjs",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(report));
  assert.equal(JSON.parse(fs.readFileSync(report, "utf8")).result.status, "passed");
  assert.equal(path.resolve(fake), path.join(root, "fake-react-doctor.mjs"));
});

test("rejects inconsistent summary and diagnostic counts", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial], {
    FAKE_JSON: fakeJson({ errors: 1, summaryOverride: { errorCount: 0 } }),
  });
  assert.equal(result.status, 1);
  assert.equal(report.result.reason, "json-summary-diagnostic-count-mismatch");
});

test("fails when blocking findings return a zero process exit", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial], {
    FAKE_JSON: fakeJson({ errors: 1 }),
  });
  assert.equal(result.status, 1);
  assert.equal(report.result.status, "failed");
  assert.equal(report.result.reason, "react-doctor-blocking-contract-violation");
});

test("rejects a zero max-duration", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial, "--max-duration", "0"]);
  assert.equal(result.status, 2);
  assert.equal(report, null);
});


test("skips React repositories with no relevant changed files", () => {
  const { root } = createRepository();
  const fake = createFakeCli(root);
  command("git", ["add", "fake-react-doctor.mjs"], root);
  command("git", ["commit", "-q", "-m", "add fake cli"], root);
  const base = command("git", ["rev-parse", "HEAD"], root);
  fs.writeFileSync(path.join(root, "README.md"), "documentation only\n");
  const { result, report } = runWrapper(root, fake, ["changed", "--base", base]);
  assert.equal(result.status, 0);
  assert.equal(report.result.status, "skipped");
  assert.equal(report.result.reason, "no-react-relevant-changes");
});

test("fails when the project-local CLI is missing", () => {
  const { root, initial } = createRepository();
  changeReactFile(root);
  const missing = path.join(root, "missing-react-doctor.mjs");
  const { result, report } = runWrapper(root, missing, ["changed", "--base", initial]);
  assert.equal(result.status, 1);
  assert.equal(report.result.status, "failed");
  assert.equal(report.result.reason, "react-doctor-cli-not-installed");
});

test("fails when React Doctor reports a hard error", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial], {
    FAKE_EXIT: "1",
    FAKE_JSON: fakeJson({
      ok: false,
      exitError: { name: "FixtureError", message: "scanner failed", chain: ["scanner failed"] },
    }),
  });
  assert.equal(result.status, 1);
  assert.equal(report.result.status, "failed");
  assert.equal(report.result.reason, "react-doctor-reported-hard-failure");
});

test("rejects inconsistent analyzed file coverage", () => {
  const { root, initial } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root);
  const { result, report } = runWrapper(root, fake, ["changed", "--base", initial], {
    FAKE_JSON: fakeJson({ analyzedFileCount: 2 }),
  });
  assert.equal(result.status, 1);
  assert.equal(report.result.reason, "invalid-json-project-coverage");
});

test("design mode runs a full advisory scan without inline disables", () => {
  const { root } = createRepository();
  const fake = createFakeCli(root);
  const argsFile = path.join(root, "args.json");
  const { result, report } = runWrapper(root, fake, ["design"], { FAKE_ARGS_FILE: argsFile });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.result.status, "passed");
  const args = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  assert.deepEqual(args.slice(args.indexOf("--scope"), args.indexOf("--scope") + 2), ["--scope", "full"]);
  assert.deepEqual(args.slice(args.indexOf("--blocking"), args.indexOf("--blocking") + 2), ["--blocking", "none"]);
  assert.ok(args.includes("--no-respect-inline-disables"));
});

test("staged warnings remain advisory", () => {
  const { root } = createRepository();
  const fake = createFakeCli(root);
  changeReactFile(root, "staged warning");
  command("git", ["add", "src/App.tsx"], root);
  const { result, report } = runWrapper(root, fake, ["staged"], {
    FAKE_JSON: fakeJson({ warnings: 1, mode: "staged" }),
  });
  assert.equal(result.status, 0);
  assert.equal(report.result.status, "passed");
  assert.equal(report.result.counts.warnings, 1);
});
