import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(here, "../..");
const hookNames = ["pre-commit", "pre-push"];

export function installGitHooks(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const platform = options.platform ?? process.platform;
  const hooksDir = path.join(repoRoot, ".githooks");
  if (!fs.existsSync(hooksDir)) throw new Error(`Git hooks directory is missing: ${hooksDir}`);

  for (const name of hookNames) {
    const hook = path.join(hooksDir, name);
    if (!fs.existsSync(hook)) throw new Error(`Required Git hook is missing: ${hook}`);
    if (platform !== "win32") {
      fs.chmodSync(hook, 0o755);
      fs.accessSync(hook, fs.constants.X_OK);
    }
  }

  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    cwd: repoRoot,
    stdio: options.stdio ?? "inherit",
  });
  const configured = execFileSync("git", ["config", "--get", "core.hooksPath"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (configured !== ".githooks") throw new Error(`Unexpected core.hooksPath: ${configured}`);
  return { hooksPath: configured, executableVerified: platform !== "win32", hooks: [...hookNames] };
}

function main() {
  const result = installGitHooks();
  console.log(`Installed repository Git hooks from ${result.hooksPath}/`);
  if (result.executableVerified) console.log("Verified POSIX execute permission for pre-commit and pre-push.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
