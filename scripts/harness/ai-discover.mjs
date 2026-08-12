#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { canonicalRoot, writeJsonAtomic } from "./full-lifecycle-lib.mjs";
import { validateDiscoverySet } from "./product-lib.mjs";
import {
  applyDiscoveryTurn,
  buildDiscoveryPrompt,
  createDiscoverySession,
  loadDiscoverySession,
  saveDiscoverySession,
} from "./discovery-session-lib.mjs";

export function runDiscoverDryRun(repoRoot) {
  const session = createDiscoverySession(repoRoot);
  applyDiscoveryTurn(session, {
    phase: "problem",
    targetDocument: "docs/product/problem.md",
    suggestedQuestion: "What problem are users facing today?",
    rationale: "Start with problem context before outcomes.",
    openQuestions: ["Who feels the pain most?"],
    fabricationRisk: "none",
  });
  const check = validateDiscoverySet(repoRoot);
  session.productCheckSnapshot = { ok: check.ok, errors: check.errors };
  saveDiscoverySession(repoRoot, session);
  return { sessionId: session.sessionId, productCheck: session.productCheckSnapshot };
}

function readTurnFile(turnFile) {
  return JSON.parse(fs.readFileSync(path.resolve(turnFile), "utf8"));
}

function setActiveSession(repoRoot, sessionId) {
  const projectFile = path.join(repoRoot, "harness/project.json");
  const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
  project.activeDiscoverySession = sessionId;
  writeJsonAtomic(projectFile, project);
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

function main() {
  const argv = process.argv.slice(2);
  const hasFlag = (name) => argv.includes(`--${name}`);
  const readOption = (name) => {
    const index = argv.indexOf(`--${name}`);
    if (index === -1) return null;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    return value;
  };

  if (hasFlag("prepare")) {
    const session = createDiscoverySession(canonicalRoot, { sessionId: readOption("session") ?? undefined });
    setActiveSession(canonicalRoot, session.sessionId);
    print({
      sessionId: session.sessionId,
      prompt: buildDiscoveryPrompt(canonicalRoot, session),
      outputSchema: "harness/schemas/discovery-turn.schema.json",
      turnOutput: `.harness/discovery/${session.sessionId}-turn.json`,
    });
    return;
  }

  if (hasFlag("render-prompt")) {
    const session = loadDiscoverySession(canonicalRoot, readOption("session"));
    process.stdout.write(buildDiscoveryPrompt(canonicalRoot, session));
    return;
  }

  if (hasFlag("record")) {
    const session = loadDiscoverySession(canonicalRoot, readOption("session"));
    const turn = readTurnFile(readOption("turn"));
    applyDiscoveryTurn(session, turn);
    saveDiscoverySession(canonicalRoot, session);
    print({ sessionId: session.sessionId, phase: session.phase, turns: session.turns.length });
    return;
  }

  if (hasFlag("finalize")) {
    const session = loadDiscoverySession(canonicalRoot, readOption("session"));
    const check = validateDiscoverySet(canonicalRoot);
    session.productCheckSnapshot = { ok: check.ok, errors: check.errors };
    saveDiscoverySession(canonicalRoot, session);
    print({ sessionId: session.sessionId, productCheck: session.productCheckSnapshot });
    if (!check.ok) process.exit(1);
    return;
  }

  if (hasFlag("dry-run")) {
    print(runDiscoverDryRun(canonicalRoot));
    return;
  }

  console.error(`Usage:
  node scripts/harness/ai-discover.mjs --prepare [--session DISC-...]
  node scripts/harness/ai-discover.mjs --render-prompt --session DISC-...
  node scripts/harness/ai-discover.mjs --record --session DISC-... --turn <turn.json>
  node scripts/harness/ai-discover.mjs --finalize --session DISC-...
  node scripts/harness/ai-discover.mjs --dry-run`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
