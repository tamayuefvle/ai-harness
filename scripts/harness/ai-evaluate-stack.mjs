#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalRoot, writeJsonAtomic } from "./full-lifecycle-lib.mjs";
import {
  applyDesignTurn,
  assertDesignSessionId,
  buildDesignPrompt,
  createDesignSession,
  finalizeDesignSession,
  loadDesignSession,
  saveDesignSession,
  snapshotDesignCheck,
} from "./design-session-lib.mjs";

export function runEvaluateStackDryRun(repoRoot) {
  const session = createDesignSession(repoRoot);
  applyDesignTurn(session, {
    mode: "publish",
    phase: session.phase === "architecture" ? "architecture" : "stack-options",
    targetDocument: session.phase === "architecture"
      ? "docs/architecture/baseline.md"
      : "docs/architecture/technology-options.md",
    suggestedQuestion: session.phase === "architecture"
      ? "What does this system own versus defer?"
      : "Which approved outcomes constrain the runtime choice?",
    rationale: "Start with the incomplete design document indicated by design:status.",
    openQuestions: ["What evidence is still missing?"],
    fabricationRisk: "none",
  });
  session.checkSnapshot = snapshotDesignCheck(repoRoot);
  saveDesignSession(repoRoot, session);
  return { sessionId: session.sessionId, phase: session.phase, checkSnapshot: session.checkSnapshot };
}

function setActiveDesignSession(repoRoot, sessionId) {
  assertDesignSessionId(sessionId);
  const projectFile = path.join(repoRoot, "harness/project.json");
  const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
  project.activeDesignSession = sessionId;
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
    const session = createDesignSession(canonicalRoot, { sessionId: readOption("session") ?? undefined });
    setActiveDesignSession(canonicalRoot, session.sessionId);
    print({
      sessionId: session.sessionId,
      prompt: buildDesignPrompt(canonicalRoot, session),
      outputSchema: "harness/schemas/design-turn.schema.json",
      turnOutput: `.harness/design/${session.sessionId}-turn.json`,
    });
    return;
  }

  if (hasFlag("render-prompt")) {
    const session = loadDesignSession(canonicalRoot, readOption("session"));
    process.stdout.write(buildDesignPrompt(canonicalRoot, session));
    return;
  }

  if (hasFlag("record")) {
    const session = loadDesignSession(canonicalRoot, readOption("session"));
    const turn = JSON.parse(fs.readFileSync(path.resolve(readOption("turn")), "utf8"));
    applyDesignTurn(session, turn);
    saveDesignSession(canonicalRoot, session);
    print({ sessionId: session.sessionId, phase: session.phase, turns: session.turns.length });
    return;
  }

  if (hasFlag("finalize")) {
    const session = finalizeDesignSession(canonicalRoot, readOption("session"));
    print({ sessionId: session.sessionId, checkSnapshot: session.checkSnapshot });
    return;
  }

  if (hasFlag("dry-run")) {
    print(runEvaluateStackDryRun(canonicalRoot));
    return;
  }

  console.error(`Usage:
  node scripts/harness/ai-evaluate-stack.mjs --prepare [--session DSN-...]
  node scripts/harness/ai-evaluate-stack.mjs --render-prompt --session DSN-...
  node scripts/harness/ai-evaluate-stack.mjs --record --session DSN-... --turn <turn.json>
  node scripts/harness/ai-evaluate-stack.mjs --finalize --session DSN-...
  node scripts/harness/ai-evaluate-stack.mjs --dry-run`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
