import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasPlaceholderLine, parseOutcomeIds, readProject } from "./product-lib.mjs";
import { manifest, sha256Files, writeJsonAtomic } from "./full-lifecycle-lib.mjs";

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contractPath = path.join(harnessRoot, "harness/contracts/design-phase.json");

export function loadDesignContract(repoRoot = harnessRoot) {
  const candidate = path.join(repoRoot, "harness/contracts/design-phase.json");
  return JSON.parse(fs.readFileSync(fs.existsSync(candidate) ? candidate : contractPath, "utf8"));
}

export function getDesignTier(project, overrideTier = null) {
  const tier = overrideTier ?? project?.designTier ?? project?.discoveryTier ?? "full";
  if (!["lite", "full"].includes(tier)) throw new Error(`Unsupported design tier: ${tier}`);
  return tier;
}

export function setDesignTier(repoRoot, tier) {
  const normalized = getDesignTier({ designTier: tier }, tier);
  const file = path.join(repoRoot, "harness/project.json");
  const project = JSON.parse(fs.readFileSync(file, "utf8"));
  project.designTier = normalized;
  writeJsonAtomic(file, project);
  return { designTier: normalized, discoveryTier: project.discoveryTier ?? null, state: project.state };
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
  return text.replace(/[#>*|`\-]/g, "").replace(/\s+/g, " ").trim().length;
}

function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

export function proposedProfileIds(project) {
  if (project?.proposedProfiles?.length) return project.proposedProfiles;
  if (project?.migration?.proposedProfiles?.length) return project.migration.proposedProfiles;
  return project?.activeProfiles ?? [];
}

export function listRegistryProfileIds(repoRoot) {
  const registryPath = path.join(repoRoot, "harness/profiles/registry.json");
  if (!fs.existsSync(registryPath)) return new Set();
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  return new Set((registry.profiles ?? []).map((entry) => entry.id));
}

export function parseCandidateRows(content) {
  const body = sectionBody(content, "## Candidates");
  const rows = [];
  for (const line of body.split("\n")) {
    if (!line.includes("|") || /^\|\s*-/.test(line) || /Option\s*\|\s*Pros/i.test(line)) continue;
    if (hasPlaceholderLine(line)) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells[0]) rows.push(cells[0]);
  }
  return rows;
}

export function parseRejectedRows(content) {
  const body = sectionBody(content, "## Rejected options");
  const rows = [];
  for (const line of body.split("\n")) {
    if (!line.includes("|") || /^\|\s*-/.test(line) || /Option\s*\|\s*Reason/i.test(line)) continue;
    if (hasPlaceholderLine(line)) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells[0] && cells[1]) rows.push(cells[0]);
  }
  return rows;
}

export function parseSelectedProfiles(content, patternSource) {
  const body = sectionBody(content, "## Selected profiles");
  const pattern = new RegExp(patternSource, "g");
  const ids = [...body.matchAll(pattern)].map((match) => match[0]);
  return [...new Set(ids)];
}

function stackConfig(contract, tier) {
  return { ...contract.stack, ...(contract.tiers?.[tier]?.stack ?? {}) };
}

function architectureConfig(contract, tier) {
  return { ...contract.architecture, ...(contract.tiers?.[tier]?.architecture ?? {}) };
}

export function validateStackDocuments(repoRoot, options = {}) {
  const project = readProject(repoRoot);
  const tier = getDesignTier(project, options.tier);
  const contract = loadDesignContract(repoRoot);
  const stack = stackConfig(contract, tier);
  const profilePattern = contract.profileIdPattern ?? stack.profileIdPattern;
  const errors = [];
  const warnings = [];
  const files = {};

  for (const relative of stack.documents) {
    const absolute = path.join(repoRoot, relative);
    if (!fs.existsSync(absolute)) {
      errors.push(`Missing required stack document: ${relative}`);
      continue;
    }
    const content = fs.readFileSync(absolute, "utf8");
    files[relative] = content;
    if (/<!-- Template:/i.test(content)) {
      errors.push(`${relative}: template banner remains; replace with project-specific content`);
    }
  }

  const optionsDoc = files["docs/architecture/technology-options.md"];
  if (optionsDoc) {
    for (const heading of stack.optionsSections) {
      const body = sectionBody(optionsDoc, heading);
      if (!body.trim() || hasPlaceholderLine(body) || meaningfulChars(body) < 20) {
        errors.push(`docs/architecture/technology-options.md: section ${heading} is incomplete`);
      }
    }
    const candidates = parseCandidateRows(optionsDoc);
    if (candidates.length < stack.minCandidates) {
      errors.push(`docs/architecture/technology-options.md: Candidates needs at least ${stack.minCandidates} real option row(s)`);
    }
  }

  let selected = [];
  const decision = files["docs/architecture/technology-decision.md"];
  if (decision) {
    for (const heading of stack.decisionSections) {
      const body = sectionBody(decision, heading);
      if (heading === "## Selected profiles") {
        if (!body.trim() || hasPlaceholderLine(body)) {
          errors.push(`docs/architecture/technology-decision.md: section ${heading} is incomplete`);
        }
        continue;
      }
      if (!body.trim() || hasPlaceholderLine(body) || meaningfulChars(body) < 15) {
        errors.push(`docs/architecture/technology-decision.md: section ${heading} is incomplete`);
      }
    }
    const decisionBody = sectionBody(decision, "## Decision");
    if (/pending/i.test(decisionBody)) {
      errors.push("docs/architecture/technology-decision.md: Decision must not remain pending");
    }
    selected = parseSelectedProfiles(decision, profilePattern);
    if (selected.length < stack.minSelectedProfiles) {
      errors.push("docs/architecture/technology-decision.md: Selected profiles needs at least one registry profile id (category/name)");
    } else {
      const registry = listRegistryProfileIds(repoRoot);
      for (const id of selected) {
        if (!registry.has(id)) {
          errors.push(`docs/architecture/technology-decision.md: unknown profile id ${id}`);
        }
      }
    }
    if (stack.requireRejectedOptions && parseRejectedRows(decision).length < 1) {
      errors.push("docs/architecture/technology-decision.md: Rejected options needs at least one real row");
    }
  }

  if (stack.requireProposedProfileSync && selected.length) {
    const proposed = proposedProfileIds(project);
    if (proposed.length) {
      for (const id of selected) {
        if (!proposed.includes(id)) {
          errors.push(`docs/architecture/technology-decision.md: selected profile ${id} is not in project proposedProfiles`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, files, tier, selectedProfiles: selected };
}

export function validateArchitectureDocuments(repoRoot, options = {}) {
  const project = readProject(repoRoot);
  const tier = getDesignTier(project, options.tier);
  const contract = loadDesignContract(repoRoot);
  const architecture = architectureConfig(contract, tier);
  const errors = [];
  const warnings = [];
  const files = {};

  for (const relative of architecture.documents) {
    const absolute = path.join(repoRoot, relative);
    if (!fs.existsSync(absolute)) {
      errors.push(`Missing required architecture document: ${relative}`);
      continue;
    }
    const content = fs.readFileSync(absolute, "utf8");
    files[relative] = content;
    if (/<!-- Template:/i.test(content)) {
      errors.push(`${relative}: template banner remains; replace with project-specific content`);
    }
  }

  const baseline = files["docs/architecture/baseline.md"];
  if (baseline) {
    for (const heading of architecture.baselineSections) {
      const body = sectionBody(baseline, heading);
      if (!body.trim() || hasPlaceholderLine(body) || meaningfulChars(body) < architecture.minSectionChars) {
        errors.push(`docs/architecture/baseline.md: section ${heading} is incomplete`);
      }
    }
  }

  if (architecture.requireSecurityQuality) {
    for (const relative of ["docs/architecture/security-baseline.md", "docs/architecture/quality-strategy.md"]) {
      const content = files[relative];
      if (!content) continue;
      const body = stripComments(content);
      if (hasPlaceholderLine(body) || meaningfulChars(body) < architecture.minPolicyChars) {
        errors.push(`${relative}: content is too short or still contains placeholders`);
      }
    }
  }

  if (architecture.requireOutcomeTrace) {
    errors.push(...validateOutcomeTrace(repoRoot, files, architecture));
  }

  return { ok: errors.length === 0, errors, warnings, files, tier };
}

export function validateOutcomeTrace(repoRoot, files, architecture) {
  const errors = [];
  const outcomesPath = path.join(repoRoot, "docs/product/outcomes.md");
  if (!fs.existsSync(outcomesPath)) {
    errors.push("docs/product/outcomes.md: required for architecture OUT-xxx trace");
    return errors;
  }
  const outcomeIds = parseOutcomeIds(fs.readFileSync(outcomesPath, "utf8"));
  if (outcomeIds.size === 0) {
    errors.push("docs/product/outcomes.md: architecture trace needs at least one OUT-xxx metric");
    return errors;
  }
  const quality = sectionBody(files["docs/architecture/baseline.md"] ?? "", "## Quality attributes");
  const strategy = files["docs/architecture/quality-strategy.md"] ?? "";
  const haystack = `${quality}\n${architecture.requireAllOutcomes ? strategy : ""}`;
  const found = [...outcomeIds].filter((id) => haystack.includes(id));
  if (architecture.requireAllOutcomes) {
    for (const id of outcomeIds) {
      if (!haystack.includes(id)) {
        errors.push(`docs/architecture/baseline.md: Quality attributes (or quality-strategy.md) must reference ${id}`);
      }
    }
  } else if (found.length === 0) {
    errors.push("docs/architecture/baseline.md: Quality attributes must reference at least one OUT-xxx from outcomes.md");
  }
  return errors;
}

export function syncProposedProfiles(repoRoot, selected) {
  const file = path.join(repoRoot, "harness/project.json");
  const project = JSON.parse(fs.readFileSync(file, "utf8"));
  const current = proposedProfileIds(project);
  if (!selected?.length) return { copied: false, proposedProfiles: current };
  if (current.length) return { copied: false, proposedProfiles: current };
  project.proposedProfiles = [...selected];
  if (project.migration && Array.isArray(project.migration.proposedProfiles) && project.migration.proposedProfiles.length === 0) {
    project.migration.proposedProfiles = [...selected];
  }
  writeJsonAtomic(file, project);
  return { copied: true, proposedProfiles: project.proposedProfiles };
}

export function stackCheckApplicable(project) {
  if (!project) return false;
  return ["DESIGNING", "ACTIVE"].includes(project.state);
}

export function architectureCheckApplicable(project) {
  if (!project) return false;
  return ["DESIGNING", "ACTIVE"].includes(project.state);
}

function projectGateFresh(repoRoot, project, name) {
  const definition = manifest(repoRoot).projectGates?.[name];
  const record = project.phaseGates?.[name];
  if (!definition || !record || record.status !== "approved") return false;
  try { return record.contractHash === sha256Files(repoRoot, definition.requiredDocuments); }
  catch { return false; }
}

export function designProgress(repoRoot) {
  const project = readProject(repoRoot);
  if (!project) return { state: "missing", nextAction: "Run bootstrap or create harness/project.json", blockers: ["harness/project.json is missing"] };

  const state = project.state;
  const designTier = getDesignTier(project);
  if (state === "MIGRATION_PENDING" || state === "PLANNING") {
    return {
      state,
      projectId: project.projectId,
      phase: "pre-design",
      designTier,
      nextAction: state === "PLANNING" ? "Finish planning first (npm run product:status)" : "npm run project:plan or complete the migration path",
      blockers: ["Project design starts after the planning gate and transition to DESIGNING."],
    };
  }

  if (state === "DESIGNING") {
    if (!projectGateFresh(repoRoot, project, "planning")) {
      return {
        state, projectId: project.projectId, phase: "planning-rework", designTier,
        nextAction: `npm run project:gate -- --to PLANNING --actor human:<name> --reason "planning baseline changed" && npm run project:advance -- --to PLANNING`,
        blockers: ["The approved Planning baseline is missing or stale. Return to PLANNING and obtain a fresh planning approval before continuing project design."],
      };
    }
    const stack = validateStackDocuments(repoRoot);
    if (!projectGateFresh(repoRoot, project, "stack")) {
      let nextAction = "Complete docs/architecture/technology-options.md and technology-decision.md";
      if (stack.ok) nextAction = `npm run stack:check && npm run project:gate -- --gate stack --actor human:<name> --reason "..."`;
      else if (stack.errors.some((error) => error.includes("technology-options"))) nextAction = "Complete docs/architecture/technology-options.md";
      else if (stack.errors.some((error) => error.includes("technology-decision"))) nextAction = "Complete docs/architecture/technology-decision.md";
      return { state, projectId: project.projectId, phase: "stack", designTier, nextAction, blockers: stack.errors };
    }

    const architecture = validateArchitectureDocuments(repoRoot);
    if (!projectGateFresh(repoRoot, project, "architecture")) {
      let nextAction = designTier === "full" ? "Complete architecture, security, and quality baselines" : "Complete docs/architecture/baseline.md";
      if (architecture.ok) nextAction = `npm run architecture:check && npm run project:gate -- --gate architecture --actor human:<name> --reason "..."`;
      return { state, projectId: project.projectId, phase: "architecture", designTier, nextAction, blockers: architecture.errors };
    }

    const resolutionPath = project.profileResolutionPath ? path.join(repoRoot, project.profileResolutionPath) : null;
    let resolution = null;
    if (resolutionPath && fs.existsSync(resolutionPath)) {
      try { resolution = JSON.parse(fs.readFileSync(resolutionPath, "utf8")); } catch { /* reported below */ }
    }
    if (resolution?.status !== "resolved") {
      return { state, projectId: project.projectId, phase: "profile-resolution", designTier, nextAction: "npm run profile:resolve", blockers: ["Profile resolution must be resolved before final design approval."] };
    }

    if (!projectGateFresh(repoRoot, project, "design")) {
      return { state, projectId: project.projectId, phase: "design-review", designTier, nextAction: `npm run project:gate -- --gate design --actor human:<name> --reason "..."`, blockers: [] };
    }

    return { state, projectId: project.projectId, phase: "design-approved", designTier, nextAction: "npm run project:advance -- --to ACTIVE", blockers: [] };
  }

  return {
    state,
    projectId: project.projectId,
    phase: "post-design",
    designTier,
    nextAction: "Project design is active; new delivery work starts in task DESIGNING.",
    blockers: [],
  };
}
