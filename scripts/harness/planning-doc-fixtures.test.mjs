import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PLANNING_DOC_TEMPLATES, liveDocsStillMatchPlanningTemplates } from "./planning-doc-fixtures.mjs";
import { isHarnessSubstrate } from "./package-substrate.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("planning doc fixtures match shipped templates on the harness substrate", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  if (!isHarnessSubstrate(pkg)) return;
  assert.equal(liveDocsStillMatchPlanningTemplates(repoRoot), true);
  for (const [relativePath, content] of Object.entries(PLANNING_DOC_TEMPLATES)) {
    assert.equal(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"), content);
  }
});
