import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { utcTimestamp } from "./time.mjs";
import { designProgress, getDesignTier, validateArchitectureDocuments, validateStackDocuments } from "./design-lib.mjs";
import { readProject } from "./product-lib.mjs";
import { canonicalRoot, writeJsonAtomic } from "./full-lifecycle-lib.mjs";

export const DESIGN_SESSION_STATES = Object.freeze(["PRODUCT_APPROVED", "STACK_APPROVED"]);
export const DESIGN_SESSION_ID_PATTERN = /^DSN-[0-9]{8}-[a-z0-9]{6}$/;
export const DESIGN_PHASES = Object.freeze(["stack-options", "stack-decision", "architecture", "review"]);
export const DESIGN_TARGET_PATTERN = /^docs\/(product\/technology-(options|decision)|architecture\/(baseline|security-baseline|quality-strategy))\.md$/;
export const DESIGN_FABRICATION_RISK = Object.freeze(["none", "low", "high"]);

export function designSessionDir(repoRoot = canonicalRoot) {
  return path.join(repoRoot, ".harness/design");
}

export function newDesignSessionId(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `DSN-${stamp}-${suffix}`;
}

export function assertDesignSessionId(sessionId) {
  if (typeof sessionId !== "string" || !DESIGN_SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error(`Invalid design session id: ${sessionId}`);
  }
  return sessionId;
}

export function designSessionPath(repoRoot, sessionId) {
  assertDesignSessionId(sessionId);
  const dir = path.resolve(designSessionDir(repoRoot));
  const file = path.resolve(dir, `${sessionId}.json`);
  const relative = path.relative(dir, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || relative.includes(path.sep)) {
    throw new Error(`Design session path escapes .harness/design: ${sessionId}`);
  }
  return file;
}

export function assertDesignTurn(turn) {
  if (!turn || typeof turn !== "object" || Array.isArray(turn)) {
    throw new Error("Design turn is missing.");
  }
  if (!DESIGN_PHASES.includes(turn.phase)) {
    throw new Error(`Invalid design turn phase: ${turn.phase}`);
  }
  if (typeof turn.targetDocument !== "string" || !DESIGN_TARGET_PATTERN.test(turn.targetDocument)) {
    throw new Error(`Invalid design turn targetDocument: ${turn.targetDocument}`);
  }
  if (typeof turn.suggestedQuestion !== "string" || !turn.suggestedQuestion.trim()) {
    throw new Error("Design turn suggestedQuestion is required.");
  }
  if (typeof turn.rationale !== "string" || !turn.rationale.trim()) {
    throw new Error("Design turn rationale is required.");
  }
  if (!Array.isArray(turn.openQuestions) || turn.openQuestions.some((item) => typeof item !== "string")) {
    throw new Error("Design turn openQuestions must be an array of strings.");
  }
  if (!DESIGN_FABRICATION_RISK.includes(turn.fabricationRisk)) {
    throw new Error(`Invalid design turn fabricationRisk: ${turn.fabricationRisk}`);
  }
  return turn;
}

export function assertDesignSession(session) {
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    throw new Error("Design session is missing.");
  }
  if (session.schemaVersion !== "1.0.0") {
    throw new Error(`Unsupported design session schemaVersion: ${session.schemaVersion}`);
  }
  assertDesignSessionId(session.sessionId);
  if (!["lite", "full"].includes(session.designTier)) {
    throw new Error(`Invalid designTier: ${session.designTier}`);
  }
  if (!DESIGN_PHASES.includes(session.phase)) {
    throw new Error(`Invalid design session phase: ${session.phase}`);
  }
  if (!Array.isArray(session.turns) || !Array.isArray(session.openQuestions)) {
    throw new Error("Design session turns/openQuestions must be arrays.");
  }
  if (session.checkSnapshot) {
    const snapshot = session.checkSnapshot;
    if (!["stack", "architecture"].includes(snapshot.kind) || typeof snapshot.ok !== "boolean" || !Array.isArray(snapshot.errors)) {
      throw new Error("Invalid design session checkSnapshot.");
    }
  }
  return session;
}

export function assertDesignSessionState(repoRoot) {
  const project = readProject(repoRoot);
  if (!project) throw new Error("harness/project.json is missing.");
  if (!DESIGN_SESSION_STATES.includes(project.state)) {
    throw new Error(
      `ai:evaluate-stack requires PRODUCT_APPROVED or STACK_APPROVED (current: ${project.state}). Finish product discovery first; do not use task ai:research for project design.`,
    );
  }
  return project;
}

export function inferDesignPhase(repoRoot) {
  const progress = designProgress(repoRoot);
  if (progress.state === "PRODUCT_APPROVED") {
    const blockers = progress.blockers ?? [];
    if (blockers.some((error) => error.includes("technology-options"))) return "stack-options";
    if (blockers.some((error) => error.includes("technology-decision"))) return "stack-decision";
    return progress.blockers?.length ? "stack-decision" : "review";
  }
  if (progress.state === "STACK_APPROVED") {
    return progress.blockers?.length ? "architecture" : "review";
  }
  return "stack-options";
}

export function createDesignSession(repoRoot, options = {}) {
  const project = assertDesignSessionState(repoRoot);
  const sessionId = options.sessionId ?? newDesignSessionId();
  const file = designSessionPath(repoRoot, sessionId);
  if (fs.existsSync(file)) {
    throw new Error(`Design session already exists: ${sessionId}`);
  }
  const now = utcTimestamp();
  const session = {
    schemaVersion: "1.0.0",
    sessionId,
    projectId: project.projectId,
    designTier: getDesignTier(project),
    phase: options.phase ?? inferDesignPhase(repoRoot),
    startedAt: now,
    updatedAt: now,
    turns: [],
    openQuestions: [],
  };
  writeJsonAtomic(file, session);
  return session;
}

export function loadDesignSession(repoRoot, sessionId) {
  const file = designSessionPath(repoRoot, sessionId);
  if (!fs.existsSync(file)) throw new Error(`Design session not found: ${sessionId}`);
  return assertDesignSession(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function saveDesignSession(repoRoot, session) {
  assertDesignSession(session);
  session.updatedAt = utcTimestamp();
  writeJsonAtomic(designSessionPath(repoRoot, session.sessionId), session);
  return session;
}

export function applyDesignTurn(session, turnPayload) {
  assertDesignTurn(turnPayload);
  session.phase = turnPayload.phase;
  session.turns.push({
    at: utcTimestamp(),
    role: "agent",
    summary: turnPayload.rationale,
    question: turnPayload.suggestedQuestion,
    targetDocument: turnPayload.targetDocument,
  });
  session.openQuestions = turnPayload.openQuestions ?? [];
  return session;
}

export function snapshotDesignCheck(repoRoot) {
  const project = readProject(repoRoot);
  if (project?.state === "STACK_APPROVED") {
    const result = validateArchitectureDocuments(repoRoot);
    return { kind: "architecture", ok: result.ok, errors: result.errors };
  }
  const result = validateStackDocuments(repoRoot);
  return { kind: "stack", ok: result.ok, errors: result.errors };
}

export function finalizeDesignSession(repoRoot, sessionId) {
  const session = loadDesignSession(repoRoot, sessionId);
  session.checkSnapshot = snapshotDesignCheck(repoRoot);
  saveDesignSession(repoRoot, session);
  return session;
}

export function buildDesignPrompt(repoRoot, session) {
  const project = readProject(repoRoot);
  const promptName = project?.state === "STACK_APPROVED"
    ? "architecture-baseline.md"
    : "technology-evaluation.md";
  const base = fs.readFileSync(path.join(repoRoot, "harness/prompts", promptName), "utf8");
  const status = designProgress(repoRoot);
  return `${base}

Session: ${session.sessionId}
Project: ${session.projectId}
Design tier: ${session.designTier}
Current phase: ${session.phase}
Project state: ${project.state}
Design status:
${JSON.stringify(status, null, 2)}

Return one design turn using harness/schemas/design-turn.schema.json.
Ask exactly one question. Propose one target document per turn. Do not install dependencies or invent performance/security evidence.
Do not start task:start or ai:research.`;
}
