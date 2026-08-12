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
  if (project.state !== "DISCOVERY") {
    throw new Error(`ai:discover requires project state DISCOVERY (current: ${project.state}). Run npm run project:discover first.`);
  }
  return project;
}

export function createDiscoverySession(repoRoot, options = {}) {
  const project = assertDiscoveryState(repoRoot);
  const sessionId = options.sessionId ?? newSessionId();
  const now = utcTimestamp();
  const session = {
    schemaVersion: "1.0.0",
    sessionId,
    projectId: project.projectId,
    discoveryTier: project.discoveryTier ?? "full",
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
    targetDocument: turnPayload.targetDocument,
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
  if (progress.state !== "DISCOVERY") return "problem";
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
  const promptPath = path.join(repoRoot, "harness/prompts/product-discovery.md");
  const base = fs.readFileSync(promptPath, "utf8");
  return `${base}

Session: ${session.sessionId}
Project: ${session.projectId}
Discovery tier: ${session.discoveryTier}
Current phase: ${session.phase}
Product status:
${JSON.stringify(status, null, 2)}

Return one discovery turn using harness/schemas/discovery-turn.schema.json.
Ask exactly one question. Update one target document per turn. Do not invent user research or market facts.`;
}
