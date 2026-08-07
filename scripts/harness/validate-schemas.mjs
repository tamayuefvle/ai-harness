import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseJsonArtifact, validateGate } from "./artifact-validator.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(repoRoot, "harness/schemas/validation-manifest.json");

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relative), "utf8"));
}

async function validateWithAjv() {
  const [{ default: Ajv2020 }, { default: addFormats }] = await Promise.all([
    import("ajv/dist/2020.js"),
    import("ajv-formats"),
  ]);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const failures = [];
  for (const entry of manifest.cases ?? []) {
    const schema = readJson(entry.schema);
    const instance = readJson(entry.instance);
    const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: true });
    addFormats(ajv);
    let validate;
    try {
      validate = ajv.compile(schema);
    } catch (error) {
      failures.push(`${entry.id}: schema compile failed: ${error.message}`);
      continue;
    }
    if (!validate(instance)) {
      failures.push(`${entry.id}: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
    } else {
      console.log(`[PASS] ${entry.id} (${entry.schema} <- ${entry.instance})`);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  console.log(`[PASS] ${manifest.cases.length} Draft 2020-12 schema cases validated with Ajv`);
}

function validateWithPython() {
  const result = spawnSync("python3", [path.join(repoRoot, "scripts/harness/validate-schemas.py")], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error("No working Draft 2020-12 schema validator is available. Install npm devDependencies (Ajv) or Python jsonschema.");
  }
  console.log("[INFO] Ajv unavailable; used the standards-compliant Python jsonschema fallback.");
}


function walk(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) out.push(absolute);
    }
  }
  return out;
}

function validateDynamicArtifacts() {
  let count = 0;
  for (const gatePath of walk(path.join(repoRoot, "docs/specs")).filter((file) => path.basename(file) === "gate.json")) {
    validateGate(JSON.parse(fs.readFileSync(gatePath, "utf8")));
    count += 1;
  }
  const reportKinds = [
    [/implementation\.json$/, "implementation"],
    [/verification\.json$/, "verification"],
    [/github-context(?:-[^/]+)?\.json$/, "githubContext"],
    [/react-doctor-(?![^/]*\.raw\.json$)[^/]+\.json$/, "reactDoctor"],
    [/review\.json$/, "review"],
  ];
  for (const file of walk(path.join(repoRoot, ".harness/reports"))) {
    const normalized = file.replaceAll("\\", "/");
    const match = reportKinds.find(([pattern]) => pattern.test(normalized));
    if (!match) continue;
    parseJsonArtifact(file, match[1], path.relative(repoRoot, file).replaceAll("\\", "/"));
    count += 1;
  }
  console.log(`[PASS] ${count} dynamic lifecycle artifacts validated`);
}
try {
  await validateWithAjv();
  validateDynamicArtifacts();
} catch (error) {
  if (error?.code === "ERR_MODULE_NOT_FOUND" || /Cannot find package/.test(error?.message ?? "")) {
    validateWithPython();
    validateDynamicArtifacts();
  } else {
    console.error(error.message);
    process.exit(1);
  }
}
