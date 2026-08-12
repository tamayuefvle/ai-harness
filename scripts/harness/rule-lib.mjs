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

function generatedHeader(source, consumer) {
  return [
    "<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->",
    `<!-- Source: harness/rules/${source}; consumer: ${consumer}; run npm run harness:generate -->`,
    "",
  ].join("\n");
}

function normalizeTarget(target) {
  if (typeof target === "string") {
    return { path: target, mode: "replace" };
  }

  if (!target || typeof target.path !== "string") {
    throw new TypeError("instruction targets must be paths or { path, mode } objects");
  }

  const mode = target.mode ?? "replace";
  if (!new Set(["replace", "append"]).has(mode)) {
    throw new TypeError(`Unsupported target mode: ${mode}`);
  }

  return { path: target.path, mode };
}

function addTextTarget(outputs, rawTarget, body, source, consumer) {
  const target = normalizeTarget(rawTarget);
  assertSafeRelativePath(target.path, `${consumer} target path`);
  const content = `${generatedHeader(source, consumer)}${body}\n`;
  if (target.mode === "append") {
    const existing = outputs.get(target.path);
    outputs.set(target.path, existing ? `${existing.trimEnd()}\n\n${content}` : content);
    return;
  }
  if (outputs.has(target.path)) {
    throw new Error(`Duplicate generated ${consumer} target without append mode: ${target.path}`);
  }
  outputs.set(target.path, content);
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

    for (const target of role.agentsTargets ?? []) addTextTarget(outputs, target, body, role.source, "shared-agents");
    for (const target of role.codexTargets ?? []) addTextTarget(outputs, target, body, role.source, "codex");

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
        `${frontmatter}${generatedHeader(role.source, "cursor")}${body}\n`,
      );
    }
  }

  return outputs;
}

/** Generated paths retired from the manifest; still removed on harness:generate when they carry the generated marker. */
export const RETIRED_GENERATED_TARGETS = Object.freeze([
  "app/AGENTS.md",
  "app/.cursor/rules/application.mdc",
]);

function isGeneratedInstruction(relativePath, content) {
  if (!content.includes("GENERATED FILE. DO NOT EDIT DIRECTLY.")) return false;
  return relativePath === "AGENTS.md" || relativePath.endsWith("/AGENTS.md") ||
    relativePath === "CODEX.md" || relativePath.endsWith("/CODEX.md") ||
    /(^|\/)\.cursor\/rules\/.*\.mdc$/.test(relativePath);
}

export function findGeneratedInstructionFiles(repoRoot) {
  const found = new Set();
  const pending = [repoRoot];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if ([".git", "node_modules", ".harness"].includes(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = path.relative(repoRoot, absolute).replaceAll("\\", "/");
      if (!/(AGENTS\.md|CODEX\.md|\.mdc)$/.test(relative)) continue;
      if (isGeneratedInstruction(relative, fs.readFileSync(absolute, "utf8"))) found.add(relative);
    }
  }
  return found;
}

export function writeOutputs(repoRoot) {
  const outputs = buildOutputs(repoRoot);
  const generated = findGeneratedInstructionFiles(repoRoot);
  for (const relativePath of RETIRED_GENERATED_TARGETS) generated.add(relativePath);
  for (const relativePath of generated) {
    if (outputs.has(relativePath)) continue;
    assertSafeRelativePath(relativePath, "generated target path");
    const target = path.join(repoRoot, relativePath);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) continue;
    if (isGeneratedInstruction(relativePath, fs.readFileSync(target, "utf8"))) fs.rmSync(target);
  }
  for (const [relativePath, content] of outputs) {
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  }
  return outputs;
}
