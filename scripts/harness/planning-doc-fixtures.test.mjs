import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PLANNING_DOC_TEMPLATES, liveDocsStillMatchPlanningTemplates } from "./planning-doc-fixtures.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("planning doc fixtures match shipped templates while this checkout still has them", () => {
  const liveProblem = fs.readFileSync(path.join(repoRoot, "docs/product/problem.md"), "utf8");
  if (!liveProblem.includes("<!-- Template:")) {
    assert.equal(liveDocsStillMatchPlanningTemplates(repoRoot), false);
    return;
  }
  assert.equal(liveDocsStillMatchPlanningTemplates(repoRoot), true);
  for (const [relativePath, content] of Object.entries(PLANNING_DOC_TEMPLATES)) {
    assert.equal(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"), content);
  }
});
