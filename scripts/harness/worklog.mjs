#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { localCalendarParts, utcTimestamp } from "./time.mjs";
import { isTaskId } from "./task-id.mjs";

const ALLOWED_ACTORS = new Set([
  "agent",
  "human",
  "system",
  "orchestrator",
  "researcher",
  "planner",
  "architect",
  "implementer",
  "verifier",
  "reviewer",
  "packager",
]);
const ALLOWED_VERIFICATION = new Set([
  "passed",
  "failed",
  "partial",
  "blocked",
  "not-run",
  "not-applicable",
]);
const ENTRY_ID = /^WL-\d{8}-[a-z0-9]+$/;
const SECRET_PATTERNS = [
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /\b(?:token|secret|password|passwd|api[_-]?key)\s*[:=]\s*[^\s"']{8,}/i,
];

function repoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  } catch {
    return process.cwd();
  }
}

function parseFlags(items) {
  const result = {};
  for (let i = 0; i < items.length; i += 1) {
    const token = items[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = items[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate option: --${key}`);
    result[key] = value;
    i += 1;
  }
  return result;
}

function assertAllowedFlags(input, allowed) {
  const unexpected = Object.keys(input).filter((key) => !allowed.has(key));
  if (unexpected.length) throw new Error(`Unknown option(s): ${unexpected.map((key) => `--${key}`).join(", ")}`);
}

function validateInline(value, label, { required = false, max = 1000 } = {}) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(`--${label} is required.`);
  if (!text) return "";
  if (text.length > max) throw new Error(`--${label} exceeds ${max} characters.`);
  if (/[\r\n\u2028\u2029]/.test(text) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
    throw new Error(`--${label} must be a single printable line.`);
  }
  if (/<!--|-->|<script\b|```/i.test(text)) throw new Error(`--${label} contains disallowed Markdown/HTML structure.`);
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) throw new Error(`--${label} appears to contain a secret.`);
  return text;
}

function splitCsv(value, label) {
  const raw = validateInline(value, label, { max: 3000 });
  if (!raw) return [];
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function safeRepoPath(root, value, label, { mustExist = false } = {}) {
  const text = validateInline(value, label, { required: true, max: 500 }).replaceAll("\\", "/");
  if (path.posix.isAbsolute(text) || /^[A-Za-z]:\//.test(text)) throw new Error(`--${label} must be repository-relative.`);
  const absolute = path.resolve(root, text);
  const relative = path.relative(root, absolute).replaceAll("\\", "/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) throw new Error(`--${label} escapes the repository root: ${text}`);
  if (mustExist) {
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error(`--${label} evidence file does not exist: ${relative}`);
    }
    if (fs.lstatSync(absolute).isSymbolicLink()) throw new Error(`--${label} evidence must not be a symbolic link: ${relative}`);
    const realRoot = fs.realpathSync(root);
    const realEvidence = fs.realpathSync(absolute);
    const realRelative = path.relative(realRoot, realEvidence);
    if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
      throw new Error(`--${label} evidence resolves outside the repository: ${relative}`);
    }
  }
  return relative;
}

function nextEntryId(parts) {
  return `WL-${parts.date.replaceAll("-", "")}-${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
}

function monthFiles(directory) {
  return fs.readdirSync(directory).filter((name) => /^\d{4}-\d{2}\.md$/.test(name)).sort();
}

function readAll(directory) {
  return monthFiles(directory).map((name) => fs.readFileSync(path.join(directory, name), "utf8")).join("\n");
}

function entries(directory) {
  return readAll(directory).split(/(?=^## WL-)/m).filter((block) => block.startsWith("## WL-"));
}

function findEntry(directory, id) {
  return entries(directory).find((block) => block.startsWith(`## ${id}\n`)) ?? null;
}

function appendEntry(directory, root, fields) {
  const now = new Date();
  const parts = localCalendarParts(now);
  const id = nextEntryId(parts);
  const file = path.join(directory, `${parts.month}.md`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, `# Worklog ${parts.month}\n\n`, "utf8");
  const lines = [
    `## ${id}`,
    `- Local time: ${parts.date} ${parts.time}`,
    `- UTC time: ${utcTimestamp(now)}`,
    `- Time zone: ${parts.timeZone}`,
    `- Entry type: ${fields.entryType}`,
    `- Actor: ${fields.actor}`,
    `- Task: ${fields.task}`,
  ];
  if (fields.corrects) lines.push(`- Corrects: ${fields.corrects}`);
  if (fields.correctionReason) lines.push(`- Correction reason: ${fields.correctionReason}`);
  lines.push(
    `- Summary: ${fields.summary}`,
    `- Decisions: ${fields.decisions || "none"}`,
    `- Files: ${fields.files.length ? fields.files.join(", ") : "none"}`,
    `- Evidence: ${fields.evidence.length ? fields.evidence.join(", ") : "none"}`,
    `- Verification: ${fields.verification}`,
    `- Next: ${fields.next || "none"}`,
    "",
  );
  fs.appendFileSync(file, `${lines.join("\n")}\n`, "utf8");
  console.log(`${id} ${path.relative(root, file).replaceAll("\\", "/")}`);
  return id;
}

const root = repoRoot();
const directory = path.join(root, "docs/worklog");
fs.mkdirSync(directory, { recursive: true });
const [command = "context", ...arguments_] = process.argv.slice(2);

try {
  if (command === "list") {
    if (arguments_.length) throw new Error("Usage: worklog list");
    console.log(monthFiles(directory).join("\n"));
    process.exit(0);
  }

  if (command === "search") {
    const query = validateInline(arguments_.join(" "), "query", { required: true, max: 500 }).toLowerCase();
    const matches = readAll(directory).split(/\r?\n/).filter((line) => line.toLowerCase().includes(query));
    console.log(matches.join("\n"));
    process.exit(0);
  }

  if (command === "context") {
    const count = arguments_[0] === undefined ? 20 : Number(arguments_[0]);
    if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error("Usage: worklog context [1-200]");
    console.log(entries(directory).slice(-count).join("\n").trim());
    process.exit(0);
  }

  if (command === "append") {
    const input = parseFlags(arguments_);
    assertAllowedFlags(input, new Set(["actor", "task", "summary", "decisions", "files", "evidence", "verification", "next"]));
    const actor = validateInline(input.actor, "actor", { required: true, max: 32 });
    if (!ALLOWED_ACTORS.has(actor)) throw new Error(`--actor must be one of: ${[...ALLOWED_ACTORS].join(", ")}`);
    const task = validateInline(input.task || "none", "task", { max: 160 });
    if (task !== "none" && !isTaskId(task)) throw new Error("--task must be 'none' or a task ID such as PF-001-example.");
    const verification = validateInline(input.verification || "not-run", "verification", { max: 32 });
    if (!ALLOWED_VERIFICATION.has(verification)) throw new Error(`--verification must be one of: ${[...ALLOWED_VERIFICATION].join(", ")}`);
    const files = splitCsv(input.files, "files").map((value) => safeRepoPath(root, value, "files"));
    const evidence = splitCsv(input.evidence, "evidence").map((value) => safeRepoPath(root, value, "evidence", { mustExist: true }));
    appendEntry(directory, root, {
      entryType: "activity",
      actor,
      task,
      summary: validateInline(input.summary, "summary", { required: true, max: 500 }),
      decisions: validateInline(input.decisions, "decisions", { max: 1000 }),
      files,
      evidence,
      verification,
      next: validateInline(input.next, "next", { max: 500 }),
    });
    process.exit(0);
  }

  if (command === "correct") {
    const input = parseFlags(arguments_);
    assertAllowedFlags(input, new Set(["id", "actor", "reason", "summary"]));
    const actor = validateInline(input.actor, "actor", { required: true, max: 32 });
    if (actor !== "human") throw new Error("Worklog corrections require --actor human.");
    const targetId = validateInline(input.id, "id", { required: true, max: 80 });
    if (!ENTRY_ID.test(targetId)) throw new Error("--id must be an existing worklog entry ID.");
    const original = findEntry(directory, targetId);
    if (!original) throw new Error(`Worklog entry not found: ${targetId}`);
    const task = original.match(/^- Task: (.+)$/m)?.[1]?.trim() || "none";
    appendEntry(directory, root, {
      entryType: "correction",
      actor,
      task,
      corrects: targetId,
      correctionReason: validateInline(input.reason, "reason", { required: true, max: 500 }),
      summary: validateInline(input.summary, "summary", { required: true, max: 500 }),
      decisions: "none",
      files: [],
      evidence: [],
      verification: "not-applicable",
      next: "none",
    });
    process.exit(0);
  }

  throw new Error("Usage: worklog <context|search|list|append|correct>");
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
