import fs from "node:fs";
import path from "node:path";

export function loadEnabledProfiles(repoRoot) {
  const projectPath = path.join(repoRoot, "harness/project.json");
  if (!fs.existsSync(projectPath)) return null;
  const project = JSON.parse(fs.readFileSync(projectPath, "utf8"));
  const selected = project.activeProfiles?.length
    ? project.activeProfiles
    : project.migration?.proposedProfiles ?? [];
  return new Set(selected);
}

export function loadManifest(repoRoot) {
  const manifestPath = path.join(repoRoot, "harness/rules/manifest.json");
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function yamlArray(values) {
  if (!values || values.length === 0) return "[]";
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function generatedHeader(source) {
  return [
    "<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->",
    `<!-- Source: harness/rules/${source}; run npm run harness:generate -->`,
    "",
  ].join("\n");
}

function normalizeAgentsTarget(target) {
  if (typeof target === "string") {
    return { path: target, mode: "replace" };
  }

  if (!target || typeof target.path !== "string") {
    throw new TypeError("agentsTargets entries must be paths or { path, mode } objects");
  }

  const mode = target.mode ?? "replace";
  if (!new Set(["replace", "append"]).has(mode)) {
    throw new TypeError(`Unsupported agentsTargets mode: ${mode}`);
  }

  return { path: target.path, mode };
}

function assertSafeRelativePath(relativePath, label) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new TypeError(`${label} must be a non-empty relative path`);
  }

  const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new TypeError(`${label} escapes the repository root: ${relativePath}`);
  }
}

export function buildOutputs(repoRoot) {
  const manifest = loadManifest(repoRoot);
  const enabledProfiles = loadEnabledProfiles(repoRoot);
  const outputs = new Map();

  for (const role of manifest) {
    if (enabledProfiles && (role.requiresProfiles ?? []).some((profile) => !enabledProfiles.has(profile))) continue;
    const body = fs
      .readFileSync(path.join(repoRoot, "harness/rules", role.source), "utf8")
      .trim();

    for (const rawTarget of role.agentsTargets ?? []) {
      const target = normalizeAgentsTarget(rawTarget);
      assertSafeRelativePath(target.path, "agentsTargets path");
      const content = `${generatedHeader(role.source)}${body}\n`;

      if (target.mode === "append") {
        const existing = outputs.get(target.path);
        outputs.set(
          target.path,
          existing ? `${existing.trimEnd()}\n\n${content}` : content,
        );
        continue;
      }

      if (outputs.has(target.path)) {
        throw new Error(
          `Duplicate generated AGENTS target without append mode: ${target.path}`,
        );
      }
      outputs.set(target.path, content);
    }

    for (const cursor of role.cursorTargets ?? []) {
      assertSafeRelativePath(cursor.path, "cursorTargets path");
      if (outputs.has(cursor.path)) {
        throw new Error(`Duplicate generated Cursor target: ${cursor.path}`);
      }

      const frontmatter = [
        "---",
        `description: ${JSON.stringify(cursor.description)}`,
        `globs: ${yamlArray(cursor.globs)}`,
        `alwaysApply: ${Boolean(cursor.alwaysApply)}`,
        "---",
        "",
      ].join("\n");

      outputs.set(
        cursor.path,
        `${frontmatter}${generatedHeader(role.source)}${body}\n`,
      );
    }
  }

  return outputs;
}

function allManifestTargets(repoRoot) {
  const targets = new Set();
  for (const role of loadManifest(repoRoot)) {
    for (const target of role.agentsTargets ?? []) targets.add(normalizeAgentsTarget(target).path);
    for (const target of role.cursorTargets ?? []) targets.add(target.path);
  }
  return targets;
}

export function writeOutputs(repoRoot) {
  const outputs = buildOutputs(repoRoot);
  for (const relativePath of allManifestTargets(repoRoot)) {
    if (outputs.has(relativePath)) continue;
    const target = path.join(repoRoot, relativePath);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) continue;
    const content = fs.readFileSync(target, "utf8");
    if (content.includes("GENERATED FILE. DO NOT EDIT DIRECTLY.")) fs.rmSync(target);
  }
  for (const [relativePath, content] of outputs) {
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  }
  return outputs;
}
