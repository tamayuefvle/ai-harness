import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadCommandGuardrails, compileRegex } from "./policy-lib.mjs";
const SAFE_ENV_KEYS = ["PATH", "HOME", "USERPROFILE", "TMP", "TEMP", "TMPDIR", "SystemRoot", "COMSPEC", "PATHEXT", "LANG", "LC_ALL", "CI"];

export function normalizeRepoRelative(repoRoot, value, label = "path") {
  if (typeof value !== "string" || !value.trim() || path.isAbsolute(value)) throw new Error(`${label} must be a non-empty repository-relative path.`);
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const absolute = path.resolve(repoRoot, normalized);
  const relative = path.relative(repoRoot, absolute).replaceAll("\\", "/");
  if (relative === "" && normalized === ".") return { relative: ".", absolute: path.resolve(repoRoot) };
  if (!relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) throw new Error(`${label} escapes repository: ${value}`);
  return { relative, absolute };
}

function assertNoDangerousArgs(repoRoot, executable, args) {
  const policy = loadCommandGuardrails();
  const lowerExe = executable.toLowerCase();
  const normalized = args.map((item) => String(item).toLowerCase());
  const commandText = [executable, ...args].join(" ");
  for (const entry of policy.commandPatterns.filter((item) => item.surfaces.includes("runtime"))) {
    if (compileRegex(entry).test(commandText)) throw new Error(`${entry.id}: ${entry.message}`);
  }
  if (policy.inlineInterpreterExecutables.includes(lowerExe) && normalized.some((v) => v === "-e" || v === "-c")) {
    throw new Error(`Inline code execution is forbidden for ${executable}. Use a reviewed repository file instead.`);
  }
  for (const arg of args) for (const entry of policy.secretArgumentPatterns) {
    if (compileRegex(entry).test(arg)) throw new Error(`Command argument appears to contain a secret (${entry.id}).`);
  }
}

export function validateCommandSpec(repoRoot, spec, { allowedExecutables = null, allowNetwork = false } = {}) {
  if (!spec || typeof spec !== "object") throw new Error("Command spec must be an object.");
  if (!/^[A-Za-z0-9._+-]+$/.test(spec.executable ?? "")) throw new Error(`Unsafe executable: ${spec.executable ?? ""}`);
  const policy = loadCommandGuardrails();
  const deniedExecutables = new Set(policy.deniedExecutables.map((entry) => entry.name.toLowerCase()));
  if (deniedExecutables.has(spec.executable.toLowerCase())) throw new Error(`Executable is forbidden by harness policy: ${spec.executable}`);
  if (allowedExecutables && !allowedExecutables.has(spec.executable)) throw new Error(`Executable is not authorized by the approved technology profiles: ${spec.executable}`);
  if (!Array.isArray(spec.args) || spec.args.some((item) => typeof item !== "string")) throw new Error("Command args must be a string array.");
  if (!Number.isInteger(spec.timeoutSeconds) || spec.timeoutSeconds < 1 || spec.timeoutSeconds > 3600) throw new Error("Command timeoutSeconds must be 1..3600.");
  if (spec.network === true && !allowNetwork) throw new Error(`Network-enabled command is not allowed in this execution context: ${spec.executable}`);
  const cwd = normalizeRepoRelative(repoRoot, spec.cwd ?? ".", "command cwd");
  if (!fs.existsSync(cwd.absolute) || !fs.statSync(cwd.absolute).isDirectory()) throw new Error(`Command cwd does not exist: ${cwd.relative}`);
  assertNoDangerousArgs(repoRoot, spec.executable, spec.args);
  const env = {};
  for (const key of SAFE_ENV_KEYS) if (process.env[key] !== undefined) env[key] = process.env[key];
  for (const [key, value] of Object.entries(spec.env ?? {})) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new Error(`Unsafe environment key: ${key}`);
    if (typeof value !== "string") throw new Error(`Environment value must be a string: ${key}`);
    if (/(token|secret|password|private[_-]?key)/i.test(key)) throw new Error(`Secret-like environment key is not allowed in a recorded command: ${key}`);
    env[key] = value;
  }
  env.CI ??= "true";
  return { ...spec, cwd: cwd.relative, _cwdAbsolute: cwd.absolute, _env: env };
}

export function executeCommandSpec(repoRoot, spec, options = {}) {
  const checked = validateCommandSpec(repoRoot, spec, options);
  const started = Date.now();
  const result = spawnSync(checked.executable, checked.args, {
    cwd: checked._cwdAbsolute,
    shell: false,
    stdio: options.stdio ?? "inherit",
    encoding: options.stdio === "pipe" ? "utf8" : undefined,
    env: checked._env,
    timeout: checked.timeoutSeconds * 1000,
    windowsHide: true,
  });
  const durationMs = Date.now() - started;
  return {
    status: result.status === 0 && !result.error ? "passed" : "failed",
    exitCode: result.status ?? null,
    signal: result.signal ?? null,
    durationMs,
    error: result.error?.message ?? null,
    stdout: typeof result.stdout === "string" ? result.stdout : null,
    stderr: typeof result.stderr === "string" ? result.stderr : null,
  };
}
