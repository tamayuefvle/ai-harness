import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { authorizeOperation, classifyRetry, computeRunIntegrity, parseActiveTask, resolveRunArtifact, sha256File, validateResume } from "./execution-lib.mjs";
import { validateCrossContracts } from "./check-cross-contracts.mjs";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const contracts = {
  capabilities: JSON.parse(fs.readFileSync(path.join(root,"harness/capabilities/manifest.json"),"utf8")),
  authorization: JSON.parse(fs.readFileSync(path.join(root,"harness/authorization/manifest.json"),"utf8")),
  execution: JSON.parse(fs.readFileSync(path.join(root,"harness/execution/manifest.json"),"utf8")),
};

test("v13 keeps a single SDLC lifecycle owner and coherent execution contracts", () => {
  assert.deepEqual(validateCrossContracts(root), []);
});

test("authorization is deny-by-default and implementer cannot perform GitHub writes", () => {
  const denied=authorizeOperation(contracts.authorization,contracts.capabilities,{role:"implementer",capabilityId:"github",providerId:"gh-cli-https",operation:"push-approved-branch",conditions:["work-scope-match","operation-approval-required","approved-digest-match","idempotency-key-required"]});
  assert.equal(denied.effect,"deny");
  const allowed=authorizeOperation(contracts.authorization,contracts.capabilities,{role:"implementer",capabilityId:"repository",providerId:"workspace-tools",operation:"write-approved-paths",conditions:["work-scope-match","approved-path-match"]});
  assert.equal(allowed.effect,"allow");
});

test("system adapter external write requires approval digest and idempotency conditions", () => {
  const denied=authorizeOperation(contracts.authorization,contracts.capabilities,{role:"system-adapter",capabilityId:"github",providerId:"gh-cli-https",operation:"push-approved-branch",conditions:["work-scope-match"]});
  assert.equal(denied.effect,"deny");
  assert.ok(denied.failedConditions.includes("operation-approval-required"));
  const allowed=authorizeOperation(contracts.authorization,contracts.capabilities,{role:"system-adapter",capabilityId:"github",providerId:"gh-cli-https",operation:"push-approved-branch",conditions:["work-scope-match","operation-approval-required","approved-digest-match","idempotency-key-required"]});
  assert.equal(allowed.effect,"allow");
});

test("retry policy never blindly retries non-idempotent or ambiguous writes", () => {
  assert.deepEqual(classifyRetry(contracts.execution,{readOnly:true}),{allowed:true,action:"bounded-retry",maxAttempts:3});
  assert.deepEqual(classifyRetry(contracts.execution,{idempotent:true}),{allowed:true,action:"same-key-retry",maxAttempts:2});
  assert.deepEqual(classifyRetry(contracts.execution,{}),{allowed:false,action:"no-blind-retry",maxAttempts:1});
  assert.deepEqual(classifyRetry(contracts.execution,{ambiguous:true}),{allowed:false,action:"reconcile-before-retry",maxAttempts:1});
});

function fixture() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"harness-execution-v13-"));
  fs.mkdirSync(path.join(dir,"harness/invariants"),{recursive:true});
  fs.mkdirSync(path.join(dir,"harness/execution"),{recursive:true});
  fs.mkdirSync(path.join(dir,"docs/specs/DEV-001-example"),{recursive:true});
  fs.writeFileSync(path.join(dir,"harness/invariants/manifest.json"),JSON.stringify({schemaVersion:"1.0.0",invariants:[]}));
  fs.writeFileSync(path.join(dir,"harness/execution/manifest.json"),JSON.stringify(contracts.execution));
  fs.writeFileSync(path.join(dir,"docs/specs/_active.md"),"---\nactive_spec: DEV-001-example\nstatus: DEVELOPING\n---\n");
  fs.writeFileSync(path.join(dir,"docs/specs/DEV-001-example/gate.json"),JSON.stringify({designApproval:{status:"approved",contractHash:"a".repeat(64)}}));
  const created="2026-08-09T06:00:00Z";
  const run={schemaVersion:"1.0.0",runId:"RUN-20260809T060000Z-deadbeef",lifecycleRef:{kind:"task",id:"DEV-001-example",state:"DEVELOPING"},state:"PAUSED",actorRole:"implementer",approvedDesignDigest:"a".repeat(64),invariantManifestDigest:sha256File(path.join(dir,"harness/invariants/manifest.json")),pendingOperation:null,completedOperationIds:[],artifactRefs:[],evidenceRefs:[],approvalRefs:[],resumeCursor:"AC-001",idempotencyKey:null,stateVersion:2,integrityHash:"",stopReason:"STOP-INPUT",createdAt:created,updatedAt:created};
  run.integrityHash=computeRunIntegrity(run); return {dir,run};
}

test("resume uses persisted canonical state, not chat memory, and rejects stale design", () => {
  const {dir,run}=fixture();
  assert.equal(validateResume(dir,run),true);
  const gate=JSON.parse(fs.readFileSync(path.join(dir,"docs/specs/DEV-001-example/gate.json"),"utf8")); gate.designApproval.contractHash="b".repeat(64); fs.writeFileSync(path.join(dir,"docs/specs/DEV-001-example/gate.json"),JSON.stringify(gate));
  assert.throws(()=>validateResume(dir,run),/Approved design digest is stale/);
});

test("STOP-INVARIANT cannot resume in place", () => {
  const {dir,run}=fixture(); run.stopReason="STOP-INVARIANT"; run.integrityHash=computeRunIntegrity(run);
  assert.throws(()=>validateResume(dir,run),/cannot be resumed in place/);
});

test("ambiguous external write requires reconciliation and exact operation approval", () => {
  const {dir,run}=fixture(); run.state="AWAITING_APPROVAL"; run.stopReason="STOP-APPROVAL"; run.pendingOperation={operationId:"OP-GITHUB-PUSH",operationRef:{capabilityId:"github",providerId:"gh-cli-https",operation:"push-approved-branch"},target:"github:o/r:b",argumentDigest:"c".repeat(64),risk:"external-write",idempotencyKey:"idem-1",commitState:"ambiguous"}; run.integrityHash=computeRunIntegrity(run);
  const approval={schemaVersion:"1.0.0",approvalId:"OPA-20260809T060001Z-deadbeef",runId:run.runId,operationId:"OP-GITHUB-PUSH",operationRef:run.pendingOperation.operationRef,target:run.pendingOperation.target,argumentDigest:run.pendingOperation.argumentDigest,risk:"external-write",decision:"approved",actor:"human:owner",reason:"Exact operation approved.",decidedAt:"2026-08-09T06:00:01Z"};
  assert.throws(()=>validateResume(dir,run,{approval}),/must be reconciled/);
  run.pendingOperation.commitState="not-started"; run.integrityHash=computeRunIntegrity(run);
  assert.equal(validateResume(dir,run,{approval}),true);
  assert.throws(()=>validateResume(dir,run,{approval:{...approval,argumentDigest:"d".repeat(64)}}),/binding does not match/);
});

import { authorizeRunOperation, completeOperation, finishRun, pauseRun, reconcileRunOperation, recordDecision, resumeRun, startRun } from "./execution-run.mjs";

function runFixture() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"harness-run-v13-"));
  fs.mkdirSync(path.join(dir,"docs/specs/DEV-001-example"),{recursive:true});
  for (const rel of [
    "harness/invariants/manifest.json",
    "harness/execution/manifest.json",
    "harness/lifecycle/manifest.json",
    "harness/capabilities/manifest.json",
    "harness/authorization/manifest.json",
  ]) {
    fs.mkdirSync(path.dirname(path.join(dir,rel)),{recursive:true});
    fs.writeFileSync(path.join(dir,rel),fs.readFileSync(path.join(root,rel)));
  }
  fs.mkdirSync(path.join(dir,"harness"),{recursive:true});
  fs.writeFileSync(path.join(dir,"harness/project.json"),JSON.stringify({schemaVersion:"1.0.0",lifecycleMode:"full",state:"ACTIVE"}));
  fs.writeFileSync(path.join(dir,"docs/specs/_active.md"),"---\nactive_spec: DEV-001-example\nstatus: DEVELOPING\n---\n");
  fs.writeFileSync(path.join(dir,"docs/specs/DEV-001-example/gate.json"),JSON.stringify({designApproval:{status:"approved",contractHash:"a".repeat(64)}}));
  fs.writeFileSync(path.join(dir,"docs/specs/DEV-001-example/plan.md"),"# Plan\n\n### Allowed paths\n- `src`\n- tests/example.test.ts\n");
  return dir;
}

test("execution run persists stop/approval/resume/completion without changing lifecycle state", () => {
  const dir=runFixture();
  const {file,run}=startRun(dir,{task:"DEV-001-example",role:"implementer"});
  assert.equal(run.lifecycleRef.state,"DEVELOPING");
  pauseRun(file,{reason:"STOP-APPROVAL",resumeCursor:"external:push",operationId:"OP-GITHUB-PUSH",capabilityId:"github",providerId:"gh-cli-https",operation:"push-approved-branch",target:"github:o/r:feature",argumentDigest:"c".repeat(64),risk:"external-write",idempotencyKey:"push-1"},dir);
  const decision=recordDecision(file,{decision:"approved",actor:"human:owner",reason:"Reviewed exact push."},dir);
  const resumed=resumeRun(file,{approvalFile:decision.file},dir);
  assert.equal(resumed.run.state,"RUNNING");
  const authorization=authorizeRunOperation(file,{role:"system-adapter",approvalFile:decision.file},dir);
  assert.equal(authorization.effect,"allow");
  completeOperation(file,{operationId:"OP-GITHUB-PUSH",resultDigest:"d".repeat(64)},dir);
  const finished=finishRun(file,{result:"succeeded"},dir);
  assert.equal(finished.state,"SUCCEEDED");
  assert.deepEqual(finished.completedOperationIds,["OP-GITHUB-PUSH"]);
  assert.equal(parseActiveTask(dir).status,"DEVELOPING");
  const events=fs.readFileSync(file.replace(/\.json$/, ".events.jsonl"),"utf8").trim().split(/\n/).map(JSON.parse);
  assert.deepEqual(events.map((event)=>event.type),["run-started","run-paused","approval-recorded","run-resumed","operation-authorized","operation-completed","run-finished"]);
});

test("rejected operation approval cannot resume", () => {
  const dir=runFixture();
  const {file}=startRun(dir,{task:"DEV-001-example",role:"implementer"});
  pauseRun(file,{reason:"STOP-APPROVAL",operationId:"OP-GITHUB-PUSH",capabilityId:"github",providerId:"gh-cli-https",operation:"push-approved-branch",target:"github:o/r:feature",argumentDigest:"c".repeat(64),risk:"external-write",idempotencyKey:"push-2"},dir);
  const decision=recordDecision(file,{decision:"rejected",actor:"human:owner",reason:"Do not push."},dir);
  assert.throws(()=>resumeRun(file,{approvalFile:decision.file},dir),/not approved/);
  assert.equal(finishRun(file,{result:"cancelled"},dir).state,"ABORTED");
});


test("runtime mutations fail closed under a per-run lock", () => {
  const dir=runFixture();
  const {file}=startRun(dir,{task:"DEV-001-example",role:"implementer"});
  fs.writeFileSync(`${file}.lock`,"held\n");
  try {
    assert.throws(()=>pauseRun(file,{reason:"STOP-INPUT"},dir),/locked; concurrent mutation is not allowed/);
  } finally { fs.unlinkSync(`${file}.lock`); }
});

test("operation completion rejects approval changed after authorization", () => {
  const dir=runFixture();
  const {file}=startRun(dir,{task:"DEV-001-example",role:"implementer"});
  pauseRun(file,{reason:"STOP-APPROVAL",operationId:"OP-GITHUB-PUSH",capabilityId:"github",providerId:"gh-cli-https",operation:"push-approved-branch",target:"github:o/r:feature",argumentDigest:"c".repeat(64),risk:"external-write",idempotencyKey:"push-3"},dir);
  const decision=recordDecision(file,{decision:"approved",actor:"human:owner",reason:"Approve exact push."},dir);
  resumeRun(file,{approvalFile:decision.file},dir);
  authorizeRunOperation(file,{role:"system-adapter",approvalFile:decision.file},dir);
  const changed=JSON.parse(fs.readFileSync(decision.file,"utf8"));
  changed.reason="Changed after authorization.";
  fs.writeFileSync(decision.file,JSON.stringify(changed,null,2)+"\n");
  assert.throws(()=>completeOperation(file,{operationId:"OP-GITHUB-PUSH",resultDigest:"d".repeat(64)},dir),/approval changed after authorization/);
});

test("run artifacts reject traversal and symbolic-link indirection", () => {
  const dir=runFixture();
  const {file}=startRun(dir,{task:"DEV-001-example",role:"implementer"});
  const rel=path.relative(dir,file).replaceAll("\\","/");
  assert.equal(resolveRunArtifact(dir,rel).absolute,file);
  const outside=path.join(dir,"outside.json"); fs.writeFileSync(outside,"{}\n");
  assert.throws(()=>resolveRunArtifact(dir,"../outside.json"),/under \.harness\/runs/);
  const link=path.join(path.dirname(file),"linked.json"); fs.symlinkSync(outside,link);
  assert.throws(()=>resolveRunArtifact(dir,path.relative(dir,link).replaceAll("\\","/")),/symbolic link/);
});


test("ambiguous commit recovery requires evidence and re-authorization before retry", () => {
  const dir=runFixture();
  const reportDir=path.join(dir,".harness/reports/DEV-001-example"); fs.mkdirSync(reportDir,{recursive:true});
  const evidence=path.join(reportDir,"github-reconciliation.json"); fs.writeFileSync(evidence,JSON.stringify({status:"confirmed-not-applied"})+"\n");
  const {file}=startRun(dir,{task:"DEV-001-example",role:"implementer"});
  pauseRun(file,{reason:"STOP-APPROVAL",operationId:"OP-GITHUB-PUSH",capabilityId:"github",providerId:"gh-cli-https",operation:"push-approved-branch",target:"github:o/r:feature",argumentDigest:"c".repeat(64),risk:"external-write",idempotencyKey:"push-recovery"},dir);
  const decision=recordDecision(file,{decision:"approved",actor:"human:owner",reason:"Approve exact push."},dir);
  resumeRun(file,{approvalFile:decision.file},dir);
  authorizeRunOperation(file,{role:"system-adapter",approvalFile:decision.file},dir);
  const recovering=pauseRun(file,{reason:"STOP-CONNECTION",commitState:"ambiguous"},dir);
  assert.equal(recovering.state,"RECOVERING");
  assert.equal(recovering.pendingOperation.commitState,"ambiguous");
  assert.throws(()=>resumeRun(file,{},dir),/must be reconciled/);
  const reconciled=reconcileRunOperation(file,{resolution:"not-applied",evidence:path.relative(dir,evidence).replaceAll("\\","/")},dir);
  assert.equal(reconciled.state,"PAUSED");
  assert.equal(reconciled.pendingOperation.commitState,"not-started");
  resumeRun(file,{},dir);
  assert.throws(()=>completeOperation(file,{operationId:"OP-GITHUB-PUSH",resultDigest:"d".repeat(64)},dir),/re-authorized after reconciliation/);
  authorizeRunOperation(file,{role:"system-adapter",approvalFile:decision.file},dir);
  assert.deepEqual(completeOperation(file,{operationId:"OP-GITHUB-PUSH",resultDigest:"d".repeat(64)},dir).completedOperationIds,["OP-GITHUB-PUSH"]);
  const events=fs.readFileSync(file.replace(/\.json$/, ".events.jsonl"),"utf8").trim().split(/\n/).map(JSON.parse);
  assert.ok(events.some((event)=>event.type==="recovery-started"));
  assert.ok(events.some((event)=>event.type==="recovery-reconciled"));
});

test("successful completion cannot bypass a paused invariant stop", () => {
  const dir=runFixture();
  const {file}=startRun(dir,{task:"DEV-001-example",role:"implementer"});
  pauseRun(file,{reason:"STOP-INVARIANT"},dir);
  assert.throws(()=>finishRun(file,{result:"succeeded"},dir),/only from RUNNING state/);
  const aborted=finishRun(file,{result:"cancelled"},dir);
  assert.equal(aborted.state,"ABORTED");
  assert.equal(aborted.stopReason,"STOP-INVARIANT");
});

test("latest immutable approval decision supersedes earlier approval", () => {
  const dir=runFixture();
  const {file}=startRun(dir,{task:"DEV-001-example",role:"implementer"});
  pauseRun(file,{reason:"STOP-APPROVAL",operationId:"OP-GITHUB-PUSH",capabilityId:"github",providerId:"gh-cli-https",operation:"push-approved-branch",target:"github:o/r:feature",argumentDigest:"c".repeat(64),risk:"external-write",idempotencyKey:"push-decision-order"},dir);
  const approved=recordDecision(file,{decision:"approved",actor:"human:owner",reason:"Initially approve."},dir);
  const rejected=recordDecision(file,{decision:"rejected",actor:"human:owner",reason:"Supersede prior decision."},dir);
  assert.throws(()=>resumeRun(file,{approvalFile:approved.file},dir),/superseded by a later decision/);
  assert.throws(()=>resumeRun(file,{approvalFile:rejected.file},dir),/not approved/);
});

test("full lifecycle blocks execution runs while project is not ACTIVE", () => {
  const dir=runFixture();
  fs.writeFileSync(path.join(dir,"harness/project.json"),JSON.stringify({schemaVersion:"1.0.0",lifecycleMode:"full",state:"MIGRATION_PENDING"}));
  assert.throws(()=>startRun(dir,{task:"DEV-001-example",role:"implementer"}),/blocks delivery tasks while project state is MIGRATION_PENDING/);
});

test("path-scoped authorization rejects targets outside approved design scope", () => {
  const dir=runFixture();
  const {file}=startRun(dir,{task:"DEV-001-example",role:"implementer"});
  pauseRun(file,{reason:"STOP-APPROVAL",operationId:"OP-WRITE",capabilityId:"repository",providerId:"workspace-tools",operation:"write-approved-paths",target:"secrets/token.txt",argumentDigest:"c".repeat(64),risk:"local-write"},dir);
  const decision=recordDecision(file,{decision:"approved",actor:"human:owner",reason:"Approve write."},dir);
  resumeRun(file,{approvalFile:decision.file},dir);
  assert.throws(()=>authorizeRunOperation(file,{role:"implementer",approvalFile:decision.file},dir),/outside approved design scope/);
});

test("path-scoped authorization allows targets inside approved design scope", () => {
  const dir=runFixture();
  const {file}=startRun(dir,{task:"DEV-001-example",role:"implementer"});
  pauseRun(file,{reason:"STOP-APPROVAL",operationId:"OP-WRITE",capabilityId:"repository",providerId:"workspace-tools",operation:"write-approved-paths",target:"src/app.ts",argumentDigest:"c".repeat(64),risk:"local-write"},dir);
  const decision=recordDecision(file,{decision:"approved",actor:"human:owner",reason:"Approve write."},dir);
  resumeRun(file,{approvalFile:decision.file},dir);
  const authorization=authorizeRunOperation(file,{role:"implementer",approvalFile:decision.file},dir);
  assert.equal(authorization.effect,"allow");
  assert.ok(authorization.conditions.includes("approved-path-match"));
});
