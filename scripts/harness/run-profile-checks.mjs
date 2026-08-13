import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { canonicalRoot, parseOptions, readJson } from "./full-lifecycle-lib.mjs";

export function runProfileChecks(repoRoot = canonicalRoot, options = {}) {
  const project = readJson(path.join(repoRoot, "harness/project.json"));
  if (!project.profileResolutionPath) throw new Error("No profile resolution recorded.");
  const resolution = readJson(path.join(repoRoot, project.profileResolutionPath));
  if (resolution.status === "unresolved") {
    return { status: "skipped", reason: "profile resolution unresolved", results: [] };
  }
  const registryDigest = crypto.createHash("sha256").update(fs.readFileSync(path.join(repoRoot, "harness/profiles/registry.json"))).digest("hex");
  if (resolution.registrySha256 !== registryDigest) throw new Error("Profile resolution is stale; run profile:resolve again.");
  const only = options.only ? new Set(options.only.split(",").filter(Boolean)) : null;
  const exclude = options.exclude ? new Set(options.exclude.split(",").filter(Boolean)) : new Set();
  const results = [];
  for (const name of resolution.checks) {
    if (only && !only.has(name)) continue;
    if (exclude.has(name)) continue;
    const command = resolution.commands[name];
    if (!command) throw new Error(`Resolved check has no command: ${name}`);
    const result = spawnSync(command, { cwd: repoRoot, shell: true, stdio: "inherit", env: { ...process.env, CI: process.env.CI ?? "true" } });
    results.push({ name, command, status: result.status === 0 ? "passed" : "failed" });
    if (result.status !== 0) {
      const error = new Error(`Profile check failed: ${name}`);
      error.results = results;
      error.exitCode = result.status ?? 1;
      throw error;
    }
  }
  return { status: "passed", results };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  try {
    const outcome = runProfileChecks(canonicalRoot, options);
    if (outcome.status === "skipped") {
      console.log(`[SKIP] profile:check not applicable (${outcome.reason}).`);
      return;
    }
    console.log(JSON.stringify({ status: "passed", results: outcome.results }, null, 2));
  } catch (error) {
    if (error.results) console.error(JSON.stringify(error.results, null, 2));
    else console.error(`[FAIL] ${error.message}`);
    process.exit(error.exitCode ?? 1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
