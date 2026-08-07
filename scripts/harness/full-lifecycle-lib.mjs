import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { utcTimestamp } from "./time.mjs";

export const canonicalRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, file);
}
export function sha256Files(repoRoot, relativePaths) {
  const hash = crypto.createHash("sha256");
  for (const relative of relativePaths) {
    const normalized = relative.replaceAll("\\", "/");
    if (!normalized || normalized.startsWith("../") || path.isAbsolute(normalized)) throw new Error(`Unsafe contract path: ${relative}`);
    const absolute = path.resolve(repoRoot, normalized);
    if (!absolute.startsWith(`${path.resolve(repoRoot)}${path.sep}`)) throw new Error(`Contract path escapes repository: ${relative}`);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`Required contract file missing: ${normalized}`);
    if (fs.lstatSync(absolute).isSymbolicLink()) throw new Error(`Contract file cannot be a symlink: ${normalized}`);
    hash.update(normalized); hash.update("\0"); hash.update(fs.readFileSync(absolute)); hash.update("\0");
  }
  return hash.digest("hex");
}
export function manifest(repoRoot = canonicalRoot) { return readJson(path.join(repoRoot, "harness/lifecycle/manifest.json")); }
export function lifecycle(repoRoot, name) {
  const value = manifest(repoRoot).lifecycles[name];
  if (!value) throw new Error(`Unknown lifecycle: ${name}`);
  return value;
}
export function transitionFor(repoRoot, name, from, to) {
  const found = lifecycle(repoRoot, name).transitions.find((item) => item.from === from && item.to === to);
  if (!found) throw new Error(`Invalid ${name} transition: ${from} -> ${to}`);
  return found;
}
export function requireHuman(actor) {
  if (!/^human:[^\s]+$/.test(actor ?? "")) throw new Error("A human actor is required in the form human:<name>.");
}
export function appendHistory(record, from, to, actor, reason, contractHash = null) {
  record.history ??= [];
  record.history.push({ from, to, actor, reason, at: utcTimestamp(), ...(contractHash ? { contractHash } : {}) });
}
export function parseOptions(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) { out._.push(token); continue; }
    const key = token.slice(2); const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    out[key] = value; i += 1;
  }
  return out;
}
export function safeId(value, pattern, label) {
  if (!pattern.test(value ?? "")) throw new Error(`Invalid ${label}: ${value ?? ""}`);
  return value;
}
export function assertNoLikelySecret(text) {
  const patterns = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/i, /gh[pousr]_[A-Za-z0-9_]{20,}/, /AKIA[0-9A-Z]{16}/, /(?:token|secret|password)\s*[:=]\s*[^\s]{8,}/i];
  if (patterns.some((pattern) => pattern.test(text))) throw new Error("Input appears to contain a secret; store only a redacted reference.");
}

export function assertProjectAllowsDelivery(repoRoot = canonicalRoot) {
  const file = path.join(repoRoot, "harness/project.json");
  if (!fs.existsSync(file)) return;
  const project = readJson(file);
  if (project.lifecycleMode === "delivery-only") return;
  if (project.state !== "ACTIVE") throw new Error(`Full lifecycle mode blocks new delivery tasks while project state is ${project.state}; project state ACTIVE is required.`);
}
