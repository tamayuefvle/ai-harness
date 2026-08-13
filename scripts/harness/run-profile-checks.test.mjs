import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runProfileChecks } from "./run-profile-checks.mjs";
import { writeJsonAtomic } from "./full-lifecycle-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("profile:check skips unresolved resolution without requiring a registry digest", () => {
  const outcome = runProfileChecks(repoRoot);
  assert.equal(outcome.status, "skipped");
  assert.match(outcome.reason, /unresolved/);
});

test("profile:check fails closed when a resolved digest is stale", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "profile-check-"));
  fs.mkdirSync(path.join(dir, "harness/generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "harness/profiles"), { recursive: true });
  writeJsonAtomic(path.join(dir, "harness/project.json"), {
    profileResolutionPath: "harness/generated/profile-resolution.json",
  });
  writeJsonAtomic(path.join(dir, "harness/profiles/registry.json"), { profiles: [] });
  writeJsonAtomic(path.join(dir, "harness/generated/profile-resolution.json"), {
    schemaVersion: "1.0.0",
    status: "resolved",
    requestedProfiles: ["language/typescript"],
    resolvedProfiles: ["language/typescript"],
    commands: {},
    checks: [],
    registrySha256: "0".repeat(64),
    generatedAt: "2026-08-13T00:00:00.000Z",
  });
  assert.throws(() => runProfileChecks(dir), /stale/);
});
