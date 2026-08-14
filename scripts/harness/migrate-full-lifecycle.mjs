import fs from "node:fs";
import path from "node:path";
import { canonicalRoot, parseOptions, writeJsonAtomic } from "./full-lifecycle-lib.mjs";

const o = parseOptions(process.argv.slice(2));
const file = path.join(canonicalRoot, "harness/project.json");
const required = [
  "docs/product/vision.md",
  "docs/product/scope.md",
  "docs/architecture/ADR-0001-stack.md",
  "scripts/harness/lifecycle-gates.mjs",
];
for (const rel of required) if (!fs.existsSync(path.join(canonicalRoot, rel))) throw new Error(`v10.1.1 migration input missing: ${rel}`);

const pending = () => ({ status: "pending", approvedBy: null, approvedAt: null, reason: null, contractHash: null });
const proposedProfiles = [
  "runtime/node",
  "package-manager/npm",
  "language/typescript",
  "framework/react",
  "framework/nextjs-app-router",
  "test/vitest-rtl",
  "test/playwright",
  "quality/react-doctor",
  "ci/github-actions",
  "deployment/vercel",
  "observability/web-basic",
];

const project = {
  schemaVersion: "2.0.0",
  projectId: o.id ?? "migrated-project",
  lifecycleMode: "full",
  state: "MIGRATION_PENDING",
  planningTier: "full",
  designTier: "full",
  phaseGates: { planning: pending(), stack: pending(), architecture: pending(), design: pending() },
  pendingApproval: null,
  decisionRefs: [
    "docs/product/vision.md",
    "docs/product/scope.md",
    "docs/architecture/technology-decision.md",
    "docs/architecture/ADR-0001-stack.md",
    "docs/architecture/baseline.md",
  ],
  activeProfiles: [],
  proposedProfiles,
  profileResolutionPath: "harness/generated/profile-resolution.json",
  migration: {
    fromVersion: "10.1.1",
    fromState: "legacy-delivery",
    proposedProfiles,
    notes: "Review the imported baseline under the v15 Planning/Design model. Do not fabricate approvals; follow MIGRATION.md before ACTIVE.",
  },
  history: [],
};

writeJsonAtomic(file, project);
console.log(JSON.stringify({
  state: project.state,
  next: ["review MIGRATION.md", "npm run profile:resolve", "record explicit v15 approvals before new delivery work"],
}, null, 2));
