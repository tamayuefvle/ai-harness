import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isHarnessSubstrate } from "./package-substrate.mjs";

export function checkCurrentVersion(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "PACKAGE_MANIFEST.json"), "utf8"));
  const version = manifest.version;
  const escapedVersion = version.replaceAll(".", "\\.");
  const expected = [
    ["README_HARNESS.md", new RegExp(`^# AI Development Harness v${escapedVersion}$`, "m")],
    ["SECURITY.md", new RegExp(`^# Security policy — AI Development Harness v${escapedVersion}$`, "m")],
    ["NEW_REPOSITORY_SETUP.md", new RegExp(`^# New Repository Setup — v${escapedVersion}$`, "m")],
    ["MIGRATION.md", new RegExp(`^# Migration to v${escapedVersion}$`, "m")],
  ];
  const failures = [];
  for (const [relative, pattern] of expected) {
    const text = fs.readFileSync(path.join(root, relative), "utf8");
    if (!pattern.test(text)) failures.push(`${relative}: current-version heading is not ${version}`);
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (isHarnessSubstrate(packageJson)) {
    if (packageJson.version !== version) failures.push(`package.json: version is not ${version}`);
    if (packageJson.private !== true) failures.push("package.json: harness substrate must remain private");
  }
  return { version, failures };
}

function runCli(root) {
  const { version, failures } = checkCurrentVersion(root);
  if (failures.length) {
    console.error("Current release metadata drift detected:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[PASS] Current release metadata is synchronized at v${version}.`);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runCli(repoRoot);
