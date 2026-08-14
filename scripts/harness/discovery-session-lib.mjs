import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { utcTimestamp } from "./time.mjs";
import { discoveryProgress, readProject } from "./product-lib.mjs";
import { canonicalRoot, writeJsonAtomic } from "./full-lifecycle-lib.mjs";

export function discoverySessionDir(repoRoot = canonicalRoot) {
  return path.join(repoRoot, ".harness/discovery");
}

export function newSessionId(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `DISC-${stamp}-${suffix}`;
}

export function sessionPath(repoRoot, sessionId) {
  return path.join(discoverySessionDir(repoRoot), `${sessionId}.json`);
}

export function assertDiscoveryState(repoRoot) {
  const project = readProject(repoRoot);
  if (!project) throw new Error("harness/project.json is missing.");
  if (project.state !== "PLANNING") {
    throw new Error(`ai:plan requires project state PLANNING (current: ${project.state}). Run npm run project:plan first.`);
  }
  return project;
}

export function createDiscoverySession(repoRoot, options = {}) {
  const project = assertDiscoveryState(repoRoot);
  const sessionId = options.sessionId ?? newSessionId();
  const now = utcTimestamp();
  const session = {
    schemaVersion: "2.0.0",
    sessionId,
    projectId: project.projectId,
    planningTier: project.planningTier ?? project.discoveryTier ?? "full",
    phase: options.phase ?? inferPhase(repoRoot),
    startedAt: now,
    updatedAt: now,
    turns: [],
    openQuestions: [],
    citations: [],
  };
  writeJsonAtomic(sessionPath(repoRoot, sessionId), session);
  return session;
}

export function loadDiscoverySession(repoRoot, sessionId) {
  const file = sessionPath(repoRoot, sessionId);
  if (!fs.existsSync(file)) throw new Error(`Discovery session not found: ${sessionId}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function saveDiscoverySession(repoRoot, session) {
  session.updatedAt = utcTimestamp();
  writeJsonAtomic(sessionPath(repoRoot, session.sessionId), session);
  return session;
}

export function appendDiscoveryTurn(session, turn) {
  session.turns.push({
    at: utcTimestamp(),
    role: turn.role ?? "agent",
    summary: turn.summary,
    ...(turn.question ? { question: turn.question } : {}),
    ...(turn.answer ? { answer: turn.answer } : {}),
    ...(turn.targetDocument ? { targetDocument: turn.targetDocument } : {}),
  });
  return session;
}

export function applyDiscoveryTurn(session, turnPayload) {
  session.phase = turnPayload.phase;
  appendDiscoveryTurn(session, {
    role: "agent",
    summary: turnPayload.rationale,
    question: turnPayload.suggestedQuestion,
    ...(turnPayload.targetDocument ? { targetDocument: turnPayload.targetDocument } : {}),
  });
  session.openQuestions = turnPayload.openQuestions ?? [];
  if (turnPayload.fabricationRisk === "high") {
    session.citations.push({
      type: "session",
      ref: session.sessionId,
      summary: "High fabrication risk flagged; require explicit citation before product claims.",
    });
  }
  return session;
}

export function inferPhase(repoRoot) {
  const progress = discoveryProgress(repoRoot);
  if (progress.state !== "PLANNING") return "problem";
  const incomplete = progress.sections?.find((section) => section.status !== "ready");
  if (!incomplete) return "review";
  if (incomplete.file.includes("problem")) return "problem";
  if (incomplete.file.includes("users")) return "users";
  if (incomplete.file.includes("outcomes")) return "outcomes";
  if (incomplete.file.includes("requirements")) return "requirements";
  return "review";
}

export function buildDiscoveryPrompt(repoRoot, session) {
  const status = discoveryProgress(repoRoot);
  const promptPath = path.join(repoRoot, "harness/prompts/planning.md");
  const base = fs.readFileSync(promptPath, "utf8");
  return `${base}

Session: ${session.sessionId}
Project: ${session.projectId}
Planning tier: ${session.planningTier}
Current phase: ${session.phase}
Product status:
${JSON.stringify(status, null, 2)}

Return one planning turn using harness/schemas/discovery-turn.schema.json.
Conversation-first: explore freely without editing canonical docs. Only when the user asks to publish/checkpoint, select one targetDocument for the proposed update. Do not invent user research or market facts.`;
}
