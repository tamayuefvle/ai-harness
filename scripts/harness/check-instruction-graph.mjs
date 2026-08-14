import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findGeneratedInstructionFiles, loadManifest } from "./rule-lib.mjs";

export const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const NESTED_AGENTS = /\b(?:[A-Za-z0-9_.-]+\/)+AGENTS\.md\b/g;

export function nestedAgentsReferences(text) {
  return [...String(text).matchAll(NESTED_AGENTS)].map((match) => match[0]);
}

export function collectInstructionGraphErrors(root) {
  const errors = [];
  const manifest = loadManifest(root);
  const ids = new Set();
  const sources = new Set();
  for (const role of manifest) {
    if (ids.has(role.id)) errors.push(`Duplicate rule id: ${role.id}`);
    ids.add(role.id);
    if (sources.has(role.source)) errors.push(`Canonical rule source is owned by more than one manifest entry: ${role.source}`);
    sources.add(role.source);
    const agents = role.agentsTargets ?? [];
    const codex = role.codexTargets ?? [];
    const cursor = role.cursorTargets ?? [];
    if (agents.length && cursor.length) {
      errors.push(`${role.id}: the same canonical source is projected to AGENTS and Cursor Rules, which duplicates Cursor context.`);
    }
    for (const raw of agents) {
      const target = typeof raw === "string" ? raw : raw.path;
      if (target !== "AGENTS.md") errors.push(`${role.id}: nested AGENTS projection is forbidden in v14; use CODEX.md + scoped Cursor Rule: ${target}`);
    }
    for (const raw of codex) {
      const target = typeof raw === "string" ? raw : raw.path;
      if (!target.endsWith("CODEX.md")) errors.push(`${role.id}: Codex-specific projection must end in CODEX.md: ${target}`);
    }
    if (codex.length && !cursor.length) {
      errors.push(`${role.id}: directory-specific canonical source has Codex projection without a Cursor-scoped projection.`);
    }
    const sourcePath = path.join(root, "harness/rules", role.source);
    const text = fs.readFileSync(sourcePath, "utf8");
    for (const nested of nestedAgentsReferences(text)) {
      errors.push(`${role.id}: canonical rule references retired nested AGENTS path ${nested}; use CODEX.md / scoped Cursor Rule routing instead.`);
    }
  }
  const config = fs.readFileSync(path.join(root, ".codex/config.toml"), "utf8");
  if (!/^project_doc_fallback_filenames\s*=\s*\["CODEX\.md"\]/m.test(config)) {
    errors.push('.codex/config.toml must declare CODEX.md as the Codex-only fallback instruction filename.');
  }
  for (const relative of findGeneratedInstructionFiles(root)) {
    if (relative !== "AGENTS.md" && relative.endsWith("/AGENTS.md")) {
      errors.push(`Nested generated AGENTS.md remains: ${relative}`);
    }
  }
  return errors;
}

function main(root = defaultRepoRoot) {
  const errors = collectInstructionGraphErrors(root);
  if (errors.length) {
    console.error("Instruction graph is ambiguous or duplicated:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  const manifest = loadManifest(root);
  const counts = {
    shared: manifest.filter((x) => (x.agentsTargets ?? []).length).length,
    codex: manifest.filter((x) => (x.codexTargets ?? []).length).length,
    cursor: manifest.filter((x) => (x.cursorTargets ?? []).length).length,
  };
  console.log(`[PASS] Instruction graph has one semantic owner per rule, no same-consumer AGENTS/Cursor duplication, and no retired nested AGENTS references (shared=${counts.shared}, codex=${counts.codex}, cursor=${counts.cursor}).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
