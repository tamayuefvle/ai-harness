import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(here, "../..");

export function reactDoctorProfileEnabled(repoRoot = defaultRepoRoot) {
  const projectPath = path.join(repoRoot, "harness/project.json");
  if (!fs.existsSync(projectPath)) return true;
  try {
    const project = JSON.parse(fs.readFileSync(projectPath, "utf8"));
    const configured = project.activeProfiles?.length ? project.activeProfiles : project.migration?.proposedProfiles ?? [];
    return configured.includes("quality/react-doctor");
  } catch {
    return true;
  }
}

function runGit(repoRoot, args) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });
}

export function selectCiMode(repoRoot = defaultRepoRoot) {
  const inside = runGit(repoRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    return { mode: "changed", reason: "not-a-git-worktree" };
  }

  const shallow = runGit(repoRoot, ["rev-parse", "--is-shallow-repository"]);
  if (shallow.status === 0 && shallow.stdout.trim() === "true") {
    return { mode: "changed", reason: "shallow-history" };
  }

  const ancestry = runGit(repoRoot, ["rev-list", "--parents", "-n", "1", "HEAD"]);
  if (ancestry.status !== 0) {
    return { mode: "changed", reason: "head-unavailable" };
  }

  const commits = ancestry.stdout.trim().split(/\s+/).filter(Boolean);
  if (commits.length === 1) {
    return { mode: "full", reason: "root-commit" };
  }
  return { mode: "changed", reason: "comparison-commit-available" };
}

export function runCli(argv = process.argv.slice(2), repoRoot = defaultRepoRoot) {
  if (!reactDoctorProfileEnabled(repoRoot)) {
    console.log("[SKIP] React Doctor profile is not active.");
    return 0;
  }
  const printModeIndex = argv.indexOf("--print-mode");
  const forwarded = argv.filter((_, index) => index !== printModeIndex);
  const selection = selectCiMode(repoRoot);

  if (printModeIndex !== -1) {
    process.stdout.write(`${selection.mode}\n`);
    return 0;
  }

  console.log(`[INFO] React Doctor CI scope: ${selection.mode} (${selection.reason})`);
  const target = path.join(here, "react-doctor.mjs");
  const result = spawnSync(process.execPath, [target, selection.mode, ...forwarded], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runCli());
}
