import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = path.join(repoRoot, ".coderabbit.yaml");

function parseScalar(value, lineNumber) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^"[^"\n]*"$/.test(trimmed)) return trimmed.slice(1, -1);
  if (/^[A-Za-z0-9_.-]+$/.test(trimmed)) return trimmed;
  throw new Error(`unsupported YAML scalar on line ${lineNumber}`);
}

function parseYamlSubset(source) {
  const root = {};
  const stack = [{ indent: -2, value: root }];
  for (const [index, rawLine] of source.split("\n").entries()) {
    const lineNumber = index + 1;
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    assert.equal(rawLine.includes("\t"), false, `tab indentation on line ${lineNumber}`);
    const indent = rawLine.length - rawLine.trimStart().length;
    assert.equal(indent % 2, 0, `indentation must use two spaces on line ${lineNumber}`);
    while (stack.at(-1).indent >= indent) stack.pop();
    const parent = stack.at(-1).value;
    const text = rawLine.trim();
    if (text.startsWith("- ")) {
      assert.ok(Array.isArray(parent), `list item without list parent on line ${lineNumber}`);
      parent.push(parseScalar(text.slice(2), lineNumber));
      continue;
    }
    const match = /^([A-Za-z0-9_]+):(.*)$/.exec(text);
    assert.ok(match, `unsupported YAML syntax on line ${lineNumber}`);
    const [, key, remainder] = match;
    assert.equal(Object.hasOwn(parent, key), false, `duplicate key ${key} on line ${lineNumber}`);
    if (remainder.trim()) {
      parent[key] = parseScalar(remainder, lineNumber);
      continue;
    }
    const following = source.split("\n").slice(index + 1).find((candidate) => candidate.trim() && !candidate.trimStart().startsWith("#"));
    const child = following?.trimStart().startsWith("- ") ? [] : {};
    parent[key] = child;
    stack.push({ indent, value: child });
  }
  return root;
}

function expectedGeneratedExclusions(manifest) {
  return manifest.categories.generated.map((pattern) => {
    if (pattern === "**/.cursor/rules/*.mdc") return "!**/.cursor/rules/**";
    if (pattern.startsWith("harness/generated/")) return "!harness/generated/**";
    return `!${pattern}`;
  });
}

test("CodeRabbit configuration preserves harness advisory-review invariants", () => {
  assert.ok(fs.existsSync(configPath), ".coderabbit.yaml must exist");
  const bytes = fs.readFileSync(configPath);
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const config = parseYamlSubset(source);

  assert.deepEqual(Object.keys(config).filter((key) => ["reviews", "knowledge_base"].includes(key)).sort(), ["knowledge_base", "reviews"]);
  assert.equal(config.reviews.profile, "chill");
  assert.equal(config.reviews.request_changes_workflow, false);
  assert.equal(config.reviews.review_status, true);
  assert.equal(config.reviews.auto_review.enabled, true);
  assert.equal(config.reviews.auto_review.auto_incremental_review, true);
  assert.equal(config.reviews.auto_review.drafts, false);
  assert.equal(config.knowledge_base.code_guidelines.enabled, true);
  assert.equal(/(^|\n)\s*path_instructions\s*:/.test(source), false);
  assert.equal(/token|api_key|secret|password|ghp_|github_pat_/i.test(source), false);

  const filters = config.reviews.path_filters;
  assert.ok(Array.isArray(filters), "reviews.path_filters must be a list");
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "PACKAGE_MANIFEST.json"), "utf8"));
  for (const exclusion of expectedGeneratedExclusions(manifest)) {
    assert.ok(filters.includes(exclusion), `missing generated exclusion derived from manifest: ${exclusion}`);
  }

  const skillsRoot = path.join(repoRoot, "harness/skills");
  const skillNames = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, "SKILL.md")))
    .map((entry) => entry.name);
  assert.ok(skillNames.length > 0, "canonical skills must be discoverable");
  assert.ok(filters.includes("!.cursor/skills/**/SKILL.md"), "generated Cursor skills must be excluded");
  assert.ok(filters.includes("!FILE_INVENTORY.txt"));
  assert.ok(filters.includes("!PACKAGE_MANIFEST.json"));
  assert.ok(filters.includes("!harness/generated/**"));

  const canonicalPrefixes = [
    "harness/rules/",
    "harness/policies/",
    "harness/lifecycle/",
    "harness/integrations/",
    "scripts/",
    ".coderabbit.yaml",
  ];
  for (const prefix of canonicalPrefixes) {
    assert.equal(filters.some((filter) => filter.startsWith("!") && filter.slice(1).startsWith(prefix)), false, `canonical source excluded: ${prefix}`);
  }
});
