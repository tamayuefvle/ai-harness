import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildOutputs, writeOutputs } from "./rule-lib.mjs";

function fixture(manifest, rules, project = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-rules-"));
  fs.mkdirSync(path.join(root, "harness/rules"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "harness/rules/manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  for (const [name, content] of Object.entries(rules)) {
    fs.writeFileSync(path.join(root, "harness/rules", name), content);
  }
  if (project) fs.writeFileSync(path.join(root, "harness/project.json"), `${JSON.stringify(project, null, 2)}\n`);
  return root;
}

test("append mode composes multiple canonical sources into one AGENTS target", () => {
  const root = fixture(
    [
      { id: "root", source: "root.md", agentsTargets: ["AGENTS.md"] },
      {
        id: "assets",
        source: "assets.md",
        agentsTargets: [{ path: "AGENTS.md", mode: "append" }],
      },
    ],
    { "root.md": "# Root", "assets.md": "# Assets" },
  );

  const output = buildOutputs(root).get("AGENTS.md");
  assert.match(output, /Source: harness\/rules\/root\.md/);
  assert.match(output, /# Root/);
  assert.match(output, /Source: harness\/rules\/assets\.md/);
  assert.match(output, /# Assets/);
  assert.ok(output.indexOf("# Root") < output.indexOf("# Assets"));
});

test("duplicate replace targets fail instead of silently overwriting", () => {
  const root = fixture(
    [
      { id: "one", source: "one.md", agentsTargets: ["AGENTS.md"] },
      { id: "two", source: "two.md", agentsTargets: ["AGENTS.md"] },
    ],
    { "one.md": "one", "two.md": "two" },
  );

  assert.throws(
    () => buildOutputs(root),
    /Duplicate generated AGENTS target without append mode/,
  );
});

test("paths escaping the repository are rejected", () => {
  const root = fixture(
    [{ id: "bad", source: "bad.md", agentsTargets: ["../AGENTS.md"] }],
    { "bad.md": "bad" },
  );

  assert.throws(() => buildOutputs(root), /escapes the repository root/);
});

test("rule manifest keeps generated instruction files outside public", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const outputs = buildOutputs(repoRoot);

  for (const target of outputs.keys()) {
    assert.equal(
      target === "public/AGENTS.md" || target.startsWith("public/.cursor/") || target.startsWith("public/.codex/"),
      false,
      `unsafe generated target: ${target}`,
    );
  }

  assert.ok(outputs.has(".cursor/rules/public-assets.mdc"));
  assert.match(outputs.get("AGENTS.md"), /# Public asset role/);
});


test("profile-scoped rules are omitted when their technology profile is inactive", () => {
  const root = fixture(
    [
      { id: "core", source: "core.md", agentsTargets: ["AGENTS.md"] },
      { id: "react", source: "react.md", requiresProfiles: ["framework/react"], agentsTargets: ["components/AGENTS.md"] },
    ],
    { "core.md": "core", "react.md": "react" },
    { activeProfiles: ["runtime/python"], migration: null },
  );
  const outputs = buildOutputs(root);
  assert.ok(outputs.has("AGENTS.md"));
  assert.equal(outputs.has("components/AGENTS.md"), false);
});

test("writeOutputs removes retired generated frontend-app root projections", () => {
  const root = fixture(
    [{ id: "core", source: "core.md", agentsTargets: ["AGENTS.md"] }],
    { "core.md": "core" },
  );
  const retiredAgents = path.join(root, "app/AGENTS.md");
  const retiredCursor = path.join(root, "app/.cursor/rules/application.mdc");
  fs.mkdirSync(path.dirname(retiredCursor), { recursive: true });
  fs.writeFileSync(
    retiredAgents,
    "<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->\n<!-- Source: harness/rules/frontend-app.md; run npm run harness:generate -->\n# stale app\n",
  );
  fs.writeFileSync(
    retiredCursor,
    "---\ndescription: \"stale\"\nglobs: []\nalwaysApply: true\n---\n<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->\n# stale cursor\n",
  );
  const handEdited = path.join(root, "app/NOTES.md");
  fs.writeFileSync(handEdited, "keep me\n");

  writeOutputs(root);

  assert.equal(fs.existsSync(retiredAgents), false);
  assert.equal(fs.existsSync(retiredCursor), false);
  assert.equal(fs.readFileSync(handEdited, "utf8"), "keep me\n");
  assert.ok(fs.existsSync(path.join(root, "AGENTS.md")));
});
