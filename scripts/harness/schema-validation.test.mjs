import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseJsonArtifact } from "./artifact-validator.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("schema validation entrypoint declares Draft 2020-12 providers", () => {
  const nodeValidator = fs.readFileSync(path.join(repoRoot, "scripts/harness/validate-schemas.mjs"), "utf8");
  const pythonValidator = fs.readFileSync(path.join(repoRoot, "scripts/harness/validate-schemas.py"), "utf8");
  assert.match(nodeValidator, /ajv\/dist\/2020\.js/);
  assert.match(nodeValidator, /validate-schemas\.py/);
  assert.match(pythonValidator, /Draft202012Validator/);
  assert.match(pythonValidator, /FormatChecker/);
});

test("every schema validation case points to repository files", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "harness/schemas/validation-manifest.json"), "utf8"));
  assert.ok(manifest.cases.length >= 10);
  for (const entry of manifest.cases) {
    assert.ok(fs.existsSync(path.join(repoRoot, entry.schema)), entry.schema);
    assert.ok(fs.existsSync(path.join(repoRoot, entry.instance)), entry.instance);
  }
});

test("every canonical JSON Schema has a validation case", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "harness/schemas/validation-manifest.json"), "utf8"));
  const covered = new Set(manifest.cases.map((entry) => entry.schema));
  const schemaFiles = [];
  for (const root of [path.join(repoRoot, "harness/schemas"), path.join(repoRoot, "harness/capabilities")]) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (entry.name.endsWith(".schema.json") || (root.endsWith("capabilities") && entry.name === "schema.json")) {
        schemaFiles.push(path.relative(repoRoot, path.join(root, entry.name)).replaceAll("\\", "/"));
      }
    }
  }
  for (const schema of schemaFiles) assert.ok(covered.has(schema), `schema missing validation case: ${schema}`);
});


test("runtime artifact validator accepts every canonical lifecycle fixture", () => {
  const cases = [
    ["gate", "docs/specs/TEMPLATE/gate.json"],
    ["implementation", "harness/schema-fixtures/implementation.valid.json"],
    ["verification", "harness/schema-fixtures/verification.valid.json"],
    ["githubContext", "harness/schema-fixtures/github-context.valid.json"],
    ["reactDoctor", "harness/schema-fixtures/react-doctor-result.valid.json"],
    ["review", "harness/schema-fixtures/review.valid.json"],
  ];
  for (const [kind, relative] of cases) {
    assert.doesNotThrow(() => parseJsonArtifact(path.join(repoRoot, relative), kind, relative));
  }
});
