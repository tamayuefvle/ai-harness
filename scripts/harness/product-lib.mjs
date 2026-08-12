import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contractPath = path.join(harnessRoot, "harness/contracts/product-discovery.json");

/** Lines or cells that indicate unreplaced template content. */
export const PLACEHOLDER_PATTERNS = [
  /^_\s*.+\s*_$/m,
  /^<!-- Template:/,
  /_Describe what/i,
  /_Describe the problem/i,
  /_Who has the problem/i,
  /_What pain or gap/i,
  /_Why is solving/i,
  /_Example_/,
  /_Target value_/,
  /_How you will measure_/,
  /_Outcomes you are not/i,
  /_Requirement_/,
  /_Short title_/,
  /_Context_/,
  /_List the outcomes/i,
  /_Describe what you are building/i,
  /_What they need_/,
  /_Limits or context_/,
  /_Role_:/,
  /_interest in the project_/,
];

export const DISCOVERY_DOCUMENTS = Object.freeze([
  "docs/product/problem.md",
  "docs/product/users.md",
  "docs/product/outcomes.md",
  "docs/product/requirements.md",
]);

const signalFeedbackContractPath = path.join(harnessRoot, "harness/contracts/product-signal-feedback.json");

export function loadSignalFeedbackContract(repoRoot = harnessRoot) {
  const candidate = path.join(repoRoot, "harness/contracts/product-signal-feedback.json");
  return JSON.parse(fs.readFileSync(fs.existsSync(candidate) ? candidate : signalFeedbackContractPath, "utf8"));
}

export function loadProductDiscoveryContract(repoRoot = harnessRoot) {
  const candidate = path.join(repoRoot, "harness/contracts/product-discovery.json");
  return JSON.parse(fs.readFileSync(fs.existsSync(candidate) ? candidate : contractPath, "utf8"));
}

export function readProject(repoRoot) {
  const file = path.join(repoRoot, "harness/project.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function getDiscoveryTier(project, overrideTier = null) {
  const tier = overrideTier ?? project?.discoveryTier ?? "full";
  if (!["lite", "full"].includes(tier)) throw new Error(`Unsupported discovery tier: ${tier}`);
  return tier;
}

export function stripCommentsAndFrontmatter(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^---[\s\S]*?---\n?/m, "")
    .trim();
}

export function hasPlaceholderLine(text) {
  const body = stripCommentsAndFrontmatter(text);
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  }
  return false;
}

function sectionBody(text, heading) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s+/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

function meaningfulChars(text) {
  return stripCommentsAndFrontmatter(text).replace(/[#>*|`|-]/g, "").replace(/\s+/g, " ").trim().length;
}

export function parseIdeaBacklog(content) {
  const ideas = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^\|\s*(IDEA-\d{3})\s*\|([^|]*)\|([^|]*)\|/);
    if (!match) continue;
    const id = match[1];
    const title = match[2].trim();
    const status = match[3].trim().toLowerCase();
    if (hasPlaceholderLine(line) || hasPlaceholderLine(title)) continue;
    if (status !== "promoted") continue;
    ideas.push(id);
  }
  return ideas;
}

export function parseOutcomeIds(content) {
  const ids = new Set();
  const metrics = sectionBody(content, "## Success metrics");
  for (const line of metrics.split("\n")) {
    if (!line.includes("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    for (const cell of cells) {
      const match = cell.match(/^OUT-\d{3}$/);
      if (match) ids.add(match[0]);
    }
  }
  return ids;
}

export function parseRequirementSection(content, heading) {
  return sectionBody(content, heading)
    .split("\n")
    .filter((line) => /^-\s+\S/.test(line.trim()))
    .map((line) => line.trim());
}

export function parseAssumptions(content) {
  const assumptions = new Map();
  for (const line of content.split("\n")) {
    const match = line.match(/^\|\s*(ASM-\d{3})\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/);
    if (!match) continue;
    const id = match[1];
    const text = match[2].trim();
    const status = match[3].trim().toLowerCase();
    const evidence = match[4].trim();
    if (hasPlaceholderLine(line) || hasPlaceholderLine(text)) continue;
    assumptions.set(id, { text, status, evidence });
  }
  return assumptions;
}

export function parseSignalFeedback(content) {
  const rows = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^\|\s*(SIG-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/);
    if (!match) continue;
    rows.push({
      signalId: match[1],
      affects: match[2].trim(),
      action: match[3].trim().toLowerCase(),
      summary: match[4].trim(),
    });
  }
  return rows;
}

export function validateAntiFabrication(files, contract, repoRoot) {
  const errors = [];
  const claimPatterns = (contract.antiFabrication?.patterns ?? []).map((source) => new RegExp(source, "i"));
  const citationPatterns = (contract.antiFabrication?.citationPatterns ?? []).map((source) => new RegExp(source, "i"));
  const assumptionsPath = path.join(repoRoot, "docs/product/assumptions.md");
  const assumptions = fs.existsSync(assumptionsPath)
    ? parseAssumptions(fs.readFileSync(assumptionsPath, "utf8"))
    : new Map();

  for (const [relative, content] of Object.entries(files)) {
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("|")) continue;
      if (!claimPatterns.some((pattern) => pattern.test(trimmed))) continue;
      if (!citationPatterns.some((pattern) => pattern.test(trimmed))) {
        errors.push(`${relative}: research-like claim requires [session:DISC-…], [source:…], or validated [assumption:ASM-xxx]: ${trimmed}`);
        continue;
      }

      let citationOk = false;
      const sessionMatch = trimmed.match(/\[session:(DISC-[0-9]{8}-[a-z0-9]{6})\]/i);
      if (sessionMatch) {
        const sessionFile = path.join(repoRoot, ".harness/discovery", `${sessionMatch[1]}.json`);
        if (fs.existsSync(sessionFile)) citationOk = true;
        else errors.push(`${relative}: citation session ${sessionMatch[1]} not found under .harness/discovery/`);
      }

      const sourceMatch = trimmed.match(/\[source:[^\]]+\]/i);
      if (sourceMatch) citationOk = true;

      const assumptionMatch = trimmed.match(/\[assumption:(ASM-\d{3})\]/i);
      if (assumptionMatch) {
        const assumption = assumptions.get(assumptionMatch[1]);
        if (assumption?.status === "validated" && assumption.evidence && !hasPlaceholderLine(assumption.evidence)) {
          citationOk = true;
        } else {
          errors.push(`${relative}: citation ${assumptionMatch[1]} must be validated with evidence in docs/product/assumptions.md`);
        }
      }

      if (!citationOk && !sessionMatch && !sourceMatch && !assumptionMatch) {
        errors.push(`${relative}: research-like claim citation format is invalid: ${trimmed}`);
      }
    }
  }
  return errors;
}

export function validateAssumptions(repoRoot, files, tierConfig) {
  const errors = [];
  if (!tierConfig.requireAssumptionValidation) return errors;
  const requirements = files["docs/product/requirements.md"] ?? "";
  const must = parseRequirementSection(requirements, "## Must");
  const assumptionRefs = new Set();
  for (const bullet of must) {
    for (const ref of referencedIds(bullet, "ASM-\\d{3}")) assumptionRefs.add(ref);
  }
  if (assumptionRefs.size === 0) return errors;

  const assumptionsPath = path.join(repoRoot, "docs/product/assumptions.md");
  if (!fs.existsSync(assumptionsPath)) {
    errors.push("docs/product/assumptions.md: required when Must items reference ASM-xxx");
    return errors;
  }
  const assumptions = parseAssumptions(fs.readFileSync(assumptionsPath, "utf8"));
  for (const ref of assumptionRefs) {
    const assumption = assumptions.get(ref);
    if (!assumption) {
      errors.push(`docs/product/assumptions.md: missing assumption ${ref} referenced from requirements`);
      continue;
    }
    if (assumption.status !== "validated") {
      errors.push(`docs/product/assumptions.md: ${ref} must be validated before supporting a Must requirement`);
      continue;
    }
    if (!assumption.evidence || hasPlaceholderLine(assumption.evidence)) {
      errors.push(`docs/product/assumptions.md: ${ref} requires evidence citation when validated`);
    }
  }
  return errors;
}

export function validateSignalFeedback(repoRoot) {
  const errors = [];
  const contract = loadSignalFeedbackContract(repoRoot);
  const feedbackPath = path.join(repoRoot, contract.feedbackDocument);
  if (!fs.existsSync(feedbackPath)) return errors;
  const rows = parseSignalFeedback(fs.readFileSync(feedbackPath, "utf8"));
  if (!rows.length) return errors;
  for (const row of rows) {
    const signalPath = path.join(repoRoot, contract.signalDirectory, `${row.signalId}.json`);
    if (!fs.existsSync(signalPath)) {
      errors.push(`${contract.feedbackDocument}: unknown signal ${row.signalId}`);
    }
    if (!contract.actions.includes(row.action)) {
      errors.push(`${contract.feedbackDocument}: invalid action for ${row.signalId}: ${row.action}`);
    }
    if (!row.affects || hasPlaceholderLine(row.affects)) {
      errors.push(`${contract.feedbackDocument}: ${row.signalId} must name an OUT-xxx or requirement trace target`);
      continue;
    }
    if (!/OUT-\d{3}|Must|IDEA-\d{3}|ASM-\d{3}/.test(row.affects)) {
      errors.push(`${contract.feedbackDocument}: ${row.signalId} affects target must reference OUT/IDEA/ASM/Must trace`);
      continue;
    }
    const outcomeMatch = row.affects.match(/OUT-\d{3}/);
    if (outcomeMatch) {
      const outcomesPath = path.join(repoRoot, "docs/product/outcomes.md");
      if (fs.existsSync(outcomesPath) && !fs.readFileSync(outcomesPath, "utf8").includes(outcomeMatch[0])) {
        errors.push(`${contract.feedbackDocument}: ${row.signalId} references unknown outcome ${outcomeMatch[0]}`);
      }
    }
    if (!row.summary || hasPlaceholderLine(row.summary)) {
      errors.push(`${contract.feedbackDocument}: ${row.signalId} requires a summary`);
    }
  }
  return errors;
}


export function referencedIds(text, pattern) {
  const regex = new RegExp(pattern, "g");
  return [...text.matchAll(regex)].map((match) => match[0]);
}

export function listDecisionFiles(repoRoot) {
  const dir = path.join(repoRoot, "docs/product/decisions");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => /^PD-\d{3}-.+\.md$/.test(name));
}

export function validateProductDocument(relativePath, content, tierConfig) {
  const errors = [];
  const warnings = [];
  if (hasPlaceholderLine(content)) {
    errors.push(`${relativePath}: unreplaced template placeholder remains`);
  }
  for (const heading of tierConfig.sections[relativePath] ?? []) {
    const body = sectionBody(content, heading);
    if (!body.trim()) {
      errors.push(`${relativePath}: missing section ${heading}`);
      continue;
    }
    const min = heading === "## Why now" ? 20 : heading === "## Stakeholders" || heading === "## Non-goals" ? 15 : 30;
    if (heading === "## Problem" || heading === "## Context") {
      if (meaningfulChars(body) < (heading === "## Context" ? 40 : 40)) {
        errors.push(`${relativePath}: section ${heading} is too short`);
      }
      continue;
    }
    if (meaningfulChars(body) < min) {
      errors.push(`${relativePath}: section ${heading} is too short`);
    }
  }
  if (relativePath === "docs/product/outcomes.md") {
    const metrics = sectionBody(content, "## Success metrics");
    const rows = metrics.split("\n").filter((line) => line.includes("|") && !/^\|\s*-/.test(line) && !/ID\s*\|\s*Metric/.test(line) && !/Metric\s*\|\s*Target/.test(line));
    if (rows.length < tierConfig.minMetrics) {
      errors.push(`${relativePath}: Success metrics table needs at least ${tierConfig.minMetrics} data row(s)`);
    }
    if (parseOutcomeIds(content).size < tierConfig.minMetrics) {
      errors.push(`${relativePath}: each metric row needs an OUT-xxx identifier`);
    }
  }
  if (relativePath === "docs/product/requirements.md") {
    const must = parseRequirementSection(content, "## Must");
    if (must.length === 0) {
      errors.push(`${relativePath}: Must section needs at least one requirement`);
    }
  }
  return { errors, warnings };
}

export function validateDiscoveryTraces(repoRoot, files, tierConfig) {
  const errors = [];
  const requirements = files["docs/product/requirements.md"] ?? "";
  const outcomes = files["docs/product/outcomes.md"] ?? "";
  const outcomeIds = parseOutcomeIds(outcomes);
  const must = parseRequirementSection(requirements, "## Must");

  if (tierConfig.requireOutcomeTrace) {
    for (const bullet of must) {
      const refs = referencedIds(bullet, "OUT-\\d{3}");
      if (refs.length === 0) {
        errors.push(`docs/product/requirements.md: Must item must reference OUT-xxx: ${bullet}`);
        continue;
      }
      for (const ref of refs) {
        if (!outcomeIds.has(ref)) {
          errors.push(`docs/product/requirements.md: unknown outcome reference ${ref}`);
        }
      }
    }
  }

  if (tierConfig.requireIdeaTrace) {
    const backlogPath = path.join(repoRoot, "docs/product/idea-backlog.md");
    if (fs.existsSync(backlogPath)) {
      const ideas = parseIdeaBacklog(fs.readFileSync(backlogPath, "utf8"));
      for (const ideaId of ideas) {
        if (!requirements.includes(ideaId)) {
          errors.push(`docs/product/idea-backlog.md: promoted idea ${ideaId} must appear in docs/product/requirements.md`);
        }
      }
    }
  }

  if (tierConfig.requireWontDecisions) {
    const wont = parseRequirementSection(requirements, "## Won't (this cycle)");
    const decisionFiles = listDecisionFiles(repoRoot);
    for (const bullet of wont) {
      const refs = referencedIds(bullet, "PD-\\d{3}");
      if (refs.length === 0) {
        errors.push(`docs/product/requirements.md: Won't item must reference PD-xxx: ${bullet}`);
        continue;
      }
      for (const ref of refs) {
        if (!decisionFiles.some((name) => name.startsWith(`${ref}-`))) {
          errors.push(`docs/product/requirements.md: missing decision record docs/product/decisions/${ref}-*.md`);
        }
      }
    }
  }

  return errors;
}

export function validateDiscoverySet(repoRoot, options = {}) {
  const project = readProject(repoRoot);
  const tier = getDiscoveryTier(project, options.tier);
  const contract = loadProductDiscoveryContract(repoRoot);
  const tierConfig = contract.tiers[tier];
  const documents = tierConfig.documents ?? DISCOVERY_DOCUMENTS;
  const errors = [];
  const warnings = [];
  const files = {};

  for (const relative of documents) {
    const absolute = path.join(repoRoot, relative);
    if (!fs.existsSync(absolute)) {
      errors.push(`Missing required product document: ${relative}`);
      continue;
    }
    const content = fs.readFileSync(absolute, "utf8");
    files[relative] = content;
    const result = validateProductDocument(relative, content, tierConfig);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  if (Object.keys(files).length === documents.length) {
    errors.push(...validateDiscoveryTraces(repoRoot, files, tierConfig));
    errors.push(...validateAssumptions(repoRoot, files, tierConfig));
    errors.push(...validateAntiFabrication(files, contract, repoRoot));
  }
  errors.push(...validateSignalFeedback(repoRoot));

  return { ok: errors.length === 0, errors, warnings, files, tier };
}

export function discoveryProgress(repoRoot) {
  const project = readProject(repoRoot);
  const state = project?.state ?? "unknown";
  const tier = project ? getDiscoveryTier(project) : "full";
  const blockers = [];
  const sections = [];
  let nextAction = null;

  if (!project) {
    return {
      state: "missing",
      nextAction: "Run bootstrap or create harness/project.json",
      blockers: ["harness/project.json is missing"],
      sections: [],
    };
  }

  if (state === "MIGRATION_PENDING") {
    return {
      state,
      projectId: project.projectId,
      discoveryTier: tier,
      nextAction: "npm run project:discover [--tier lite|full]",
      blockers: [],
      sections: [],
      note: "Choose greenfield discovery or complete migration path before delivery tasks.",
    };
  }

  if (state === "DISCOVERY") {
    const check = validateDiscoverySet(repoRoot, { tier });
    for (const relative of DISCOVERY_DOCUMENTS) {
      const docErrors = check.errors.filter((error) => error.startsWith(relative));
      if (docErrors.length) {
        sections.push({ file: relative, status: "incomplete", errors: docErrors });
        if (!nextAction) nextAction = `Complete ${relative}`;
        blockers.push(...docErrors);
      } else if (check.files[relative]) {
        sections.push({ file: relative, status: "ready" });
      } else {
        sections.push({ file: relative, status: "missing" });
        if (!nextAction) nextAction = `Create ${relative}`;
      }
    }
    const traceErrors = check.errors.filter((error) => !DISCOVERY_DOCUMENTS.some((doc) => error.startsWith(doc)));
    if (traceErrors.length) {
      blockers.push(...traceErrors);
      if (!nextAction) nextAction = "Fix idea/outcome/decision traceability in requirements and decisions/";
    }
    if (check.ok) {
      nextAction = `npm run product:check && npm run project:gate -- --to PRODUCT_APPROVED --actor human:<name> --reason "..."`;
    }
    return { state, projectId: project.projectId, discoveryTier: tier, nextAction, blockers, sections };
  }

  return {
    state,
    projectId: project.projectId,
    discoveryTier: tier,
    nextAction: state === "PRODUCT_APPROVED"
      ? "Continue stack selection: docs/product/technology-options.md"
      : "See docs/workflow/PRODUCT_DISCOVERY.md and FULL_LIFECYCLE.md",
    blockers,
    sections,
  };
}

export function productCheckApplicable(project) {
  if (!project) return false;
  return ["DISCOVERY", "PRODUCT_APPROVED", "STACK_APPROVED", "ARCHITECTURE_APPROVED", "ACTIVE"].includes(project.state);
}
