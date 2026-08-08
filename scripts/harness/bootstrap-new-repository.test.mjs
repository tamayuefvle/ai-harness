import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { bootstrapNewRepository, normalizePackageName } from "./bootstrap-new-repository.mjs";

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-bootstrap-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "# fixture\n");
  fs.writeFileSync(path.join(dir, "README_HARNESS.md"), "# fixture\n");
  fs.writeFileSync(path.join(dir, ".gitignore.harness-fragment"), ".harness/\n.env\n");
  fs.writeFileSync(path.join(dir, "package.scripts.fragment.json"), JSON.stringify({ scripts: { "verify:harness": "node verify.mjs" } }, null, 2));
  fs.writeFileSync(path.join(dir, "package.devDependencies.fragment.json"), JSON.stringify({ devDependencies: { ajv: "^8.17.1" } }, null, 2));
  return dir;
}

function cleanup(dir) { fs.rmSync(dir, { recursive: true, force: true }); }

test("normalizes repository directory names into npm-safe names", () => {
  assert.equal(normalizePackageName("My Portfolio React"), "my-portfolio-react");
  assert.equal(normalizePackageName("___"), "app");
});

test("does not present profile resolution as an unconditional bootstrap command", () => {
  const source = fs.readFileSync(new URL("./bootstrap-new-repository.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*"npm run profile:resolve",?$/m);
  assert.match(source, /Review and approve product profiles before running npm run profile:resolve/);
});

test("check mode is read-only", () => {
  const dir = fixture();
  try {
    const result = bootstrapNewRepository(dir, { name: "example-app" });
    assert.equal(result.mode, "check-only");
    assert.equal(fs.existsSync(path.join(dir, "package.json")), false);
    assert.equal(fs.existsSync(path.join(dir, ".gitignore")), false);
  } finally { cleanup(dir); }
});

test("write mode creates a minimal private package and merges gitignore", () => {
  const dir = fixture();
  try {
    fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
    const result = bootstrapNewRepository(dir, { write: true, name: "example-app" });
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    assert.equal(result.mode, "written");
    assert.deepEqual(pkg, {
      name: "example-app",
      version: "0.0.0",
      private: true,
      scripts: { "verify:harness": "node verify.mjs" },
      devDependencies: { ajv: "^8.17.1" },
    });
    const ignore = fs.readFileSync(path.join(dir, ".gitignore"), "utf8");
    assert.match(ignore, /node_modules\//);
    assert.match(ignore, /\.harness\//);
    assert.match(ignore, /^\.env$/m);
  } finally { cleanup(dir); }
});

test("refuses to overwrite an existing package.json", () => {
  const dir = fixture();
  try {
    fs.writeFileSync(path.join(dir, "package.json"), "{}\n");
    assert.throws(() => bootstrapNewRepository(dir, { write: true }), /already exists/);
  } finally { cleanup(dir); }
});

test("refuses ambiguous package-manager state when a lockfile already exists", () => {
  const dir = fixture();
  try {
    fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    assert.throws(() => bootstrapNewRepository(dir, { write: true }), /lockfile\(s\) exist/);
  } finally { cleanup(dir); }
});

test("rejects an invalid explicit npm package name", () => {
  const dir = fixture();
  try {
    assert.throws(() => bootstrapNewRepository(dir, { write: true, name: "Invalid Package Name" }), /Invalid npm package name/);
  } finally { cleanup(dir); }
});

test("requires execution at the Git root", () => {
  const dir = fixture();
  try {
    const child = path.join(dir, "child");
    fs.mkdirSync(child);
    fs.writeFileSync(path.join(child, "AGENTS.md"), "# fixture\n");
    fs.writeFileSync(path.join(child, "README_HARNESS.md"), "# fixture\n");
    fs.writeFileSync(path.join(child, ".gitignore.harness-fragment"), ".harness/\n");
    fs.writeFileSync(path.join(child, "package.scripts.fragment.json"), JSON.stringify({ scripts: {} }));
    fs.writeFileSync(path.join(child, "package.devDependencies.fragment.json"), JSON.stringify({ devDependencies: {} }));
    assert.throws(() => bootstrapNewRepository(child, { write: true }), /Run bootstrap from the Git root/);
  } finally { cleanup(dir); }
});

test("rejects malformed package fragments", () => {
  const dir = fixture();
  try {
    fs.writeFileSync(path.join(dir, "package.scripts.fragment.json"), JSON.stringify({ scripts: {}, extra: true }));
    assert.throws(() => bootstrapNewRepository(dir, { write: true }), /must contain only the top-level key scripts/);
  } finally { cleanup(dir); }
});
