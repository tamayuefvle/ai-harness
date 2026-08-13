import assert from "node:assert/strict"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import test from "node:test";
import { lifecycle, transitionFor, requireHuman, sha256Files } from "./full-lifecycle-lib.mjs";
import { resolveProfiles } from "./profile-resolve.mjs";
const repoRoot=path.resolve(path.dirname(new URL(import.meta.url).pathname),"../..");
test("canonical task states come from lifecycle manifest and keep DONE terminal",()=>{ const task=lifecycle(repoRoot,"task"); assert.deepEqual(task.activeStates,["IDEA","SPEC_READY","PLAN_READY","IMPLEMENTING","VERIFYING","REVIEW_READY","DEPLOY_READY"]); assert.deepEqual(task.terminalStates,["DONE"]); });
test("project lifecycle rejects skipped transitions",()=>{ assert.throws(()=>transitionFor(repoRoot,"project","DISCOVERY","ACTIVE"),/Invalid project transition/); });
test("project lifecycle allows MIGRATION_PENDING to DISCOVERY",()=>{ assert.doesNotThrow(()=>transitionFor(repoRoot,"project","MIGRATION_PENDING","DISCOVERY")); });
test("human approvals require an explicit human actor",()=>{ assert.throws(()=>requireHuman("agent"),/human actor/); assert.doesNotThrow(()=>requireHuman("human:tama")); });
test("contract hashing fails closed for missing or traversing paths",()=>{ const temp=fs.mkdtempSync(path.join(os.tmpdir(),"contract-")); fs.writeFileSync(path.join(temp,"a.md"),"a"); assert.match(sha256Files(temp,["a.md"]),/^[0-9a-f]{64}$/); assert.throws(()=>sha256Files(temp,["../x"]),/Unsafe|escapes/); assert.throws(()=>sha256Files(temp,["missing"]),/missing/); });
test("profile resolver expands dependencies and preserves deterministic order",()=>{ const result=resolveProfiles(repoRoot,["framework/nextjs-app-router","quality/react-doctor"]); assert.ok(result.resolvedProfiles.indexOf("runtime/node")<result.resolvedProfiles.indexOf("framework/nextjs-app-router")); assert.ok(result.resolvedProfiles.includes("framework/react")); assert.ok(result.checks.includes("build")); assert.ok(result.checks.includes("reactDoctor")); });
test("profile resolver rejects unknown profiles",()=>{ assert.throws(()=>resolveProfiles(repoRoot,["runtime/unknown"]),/Unknown profile/); });
test("deployment/aws resolves runtime/node without adding a deploy command",()=>{
  const result=resolveProfiles(repoRoot,["deployment/aws"]);
  assert.ok(result.resolvedProfiles.includes("runtime/node"));
  assert.ok(result.resolvedProfiles.includes("deployment/aws"));
  assert.ok(result.capabilities.includes("preview-deployment"));
  assert.ok(result.capabilities.includes("production-deployment"));
  assert.ok(result.riskControls.includes("production-human-approval"));
  assert.ok(result.riskControls.includes("secrets-not-in-repository"));
  assert.equal(result.commands.deploy, undefined);
});
test("AWS production deploy CLIs are denied by command guardrails",()=>{
  const policy=JSON.parse(fs.readFileSync(path.join(repoRoot,"harness/policies/command-guardrails.json"),"utf8"));
  assert.ok(policy.commandPatterns.some((entry)=>entry.id==="CMD-AWS-PRODUCTION-DEPLOY"));
  assert.ok(policy.codexPrefixRules.some((entry)=>entry.id==="CMD-CDK-DEPLOY"));
});



test("generated lifecycle reference is synchronized with the canonical manifest",()=>{
  const generated=fs.readFileSync(path.join(repoRoot,"docs/workflow/LIFECYCLE_REFERENCE.generated.md"),"utf8");
  assert.match(generated,/Source: harness\/lifecycle\/manifest.json/);
  for(const name of ["project","task","release","incident"]) assert.match(generated,new RegExp(`## ${name}`));
});
