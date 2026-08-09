import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildSkillOutputs } from "./skill-lib.mjs";
import { assertFallbackDecision, claimDiagnosisAttempt, createHandoff, isHumanFirst, recordDiagnosisComplete, recordImplementationAttempt, sha256File, validateFallbackForImplementation } from "./fallback-lib.mjs";

const root=path.resolve(new URL("../..",import.meta.url).pathname);

test("fallback contract is Cursor -> fresh read-only Codex diagnosis -> Human without automatic loops",()=>{
  const m=JSON.parse(fs.readFileSync(path.join(root,"harness/fallback/manifest.json"),"utf8"));
  assert.equal(m.primaryExecutor,"cursor"); assert.equal(m.secondaryExecutor,"codex-cli"); assert.equal(m.terminalFallback,"human");
  assert.equal(m.diagnostic.freshSession,true); assert.equal(m.diagnostic.sandbox,"read-only"); assert.equal(m.diagnostic.implementationBeforeDecision,false);
  assert.equal(m.secondaryImplementation.reuseRole,"implementer"); assert.equal(m.secondaryImplementation.maxBoundedStrategies,1); assert.equal(m.secondaryImplementation.requireMateriallyDifferentStrategy,true);
  assert.equal(m.review.reuseRole,"reviewer"); assert.equal(m.review.sandbox,"read-only"); assert.equal(m.review.mustNotReuseImplementationContext,true);
  assert.equal(m.loopPolicy.cursorToCodexToCursorAutomaticLoop,false); assert.equal(m.loopPolicy.codexRetryWithNewSessionAutomaticLoop,false);
  assert.equal(isHumanFirst("MFA_REQUIRED",root),true);
});

test("generated Cursor fallback Skill is synchronized from the canonical skill",()=>{
  const outputs=buildSkillOutputs(root); const rel=".cursor/skills/executor-fallback/SKILL.md";
  assert.equal(fs.readFileSync(path.join(root,rel),"utf8"),outputs.get(rel));
  assert.match(outputs.get(rel),/ai:fallback-diagnose/); assert.match(outputs.get(rel),/Do not return automatically to Cursor/i);
});

test("fallback handoff binds active task, approved plan digest, git head, and failure evidence",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"fallback-v131-"));
  fs.mkdirSync(path.join(dir,"docs/specs/DEV-001-example"),{recursive:true}); fs.mkdirSync(path.join(dir,"harness/execution"),{recursive:true});
  fs.writeFileSync(path.join(dir,"docs/specs/_active.md"),"---\nactive_spec: DEV-001-example\nstatus: IMPLEMENTING\n---\n");
  fs.writeFileSync(path.join(dir,"docs/specs/DEV-001-example/gate.json"),JSON.stringify({planApproval:{status:"approved",contractHash:"a".repeat(64)}}));
  fs.writeFileSync(path.join(dir,"harness/execution/manifest.json"),fs.readFileSync(path.join(root,"harness/execution/manifest.json")));
  fs.mkdirSync(path.join(dir,".harness/reports/DEV-001-example"),{recursive:true}); fs.writeFileSync(path.join(dir,".harness/reports/DEV-001-example/build.log"),"failed\n");
  execFileSync("git",["init","-q"],{cwd:dir}); execFileSync("git",["config","user.email","test@example.invalid"],{cwd:dir}); execFileSync("git",["config","user.name","Harness Test"],{cwd:dir}); fs.writeFileSync(path.join(dir,"x.txt"),"x\n"); execFileSync("git",["add","x.txt"],{cwd:dir}); execFileSync("git",["commit","-qm","base"],{cwd:dir});
  const h=createHandoff(dir,{acceptanceId:"AC-001",failedGoal:"fix",strategyId:"cursor-1",strategySummary:"one bounded strategy",failureClass:"build",failureSignature:"E_BUILD",commandsExecuted:["npm test"],changedArtifactRefs:[],evidenceRefs:[".harness/reports/DEV-001-example/build.log"],cursorDiagnosis:"failed",prohibitedRepeats:["same build strategy"]});
  assert.equal(h.taskId,"DEV-001-example"); assert.equal(h.approvedPlanDigest,"a".repeat(64)); assert.match(h.head,/^[a-f0-9]{40}$/); assert.equal(h.sourceExecutor,"cursor"); assert.equal(h.targetExecutor,"codex-cli");
  assert.throws(()=>createHandoff(dir,{acceptanceId:"AC-001",failedGoal:"fix",strategyId:"x",strategySummary:"x",failureClass:"x",failureSignature:"x",cursorDiagnosis:"x",evidenceRefs:[],prohibitedRepeats:["x"]}),/failure evidence/);
});

test("fallback decision allows only a materially different strategy or human escalation",()=>{
  const h={handoffId:"FBH-x",prohibitedRepeats:["npm install"]};
  assert.equal(assertFallbackDecision({handoffId:"FBH-x",handoffDigest:"d",decision:"alternative_strategy",repeatStrategy:false,materialDifference:"inspect platform resolver",alternativeStrategy:"change platform resolution configuration"},h,"d"),true);
  assert.throws(()=>assertFallbackDecision({handoffId:"FBH-x",handoffDigest:"d",decision:"alternative_strategy",repeatStrategy:false,materialDifference:"npm install",alternativeStrategy:"npm install"},h,"d"),/repeats a prohibited/);
});

test("fallback implementation is bound to the exact handoff, approved plan, HEAD, and workspace digest",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"fallback-bind-v131-"));
  fs.mkdirSync(path.join(dir,"docs/specs/DEV-001-example"),{recursive:true}); fs.mkdirSync(path.join(dir,"harness/execution"),{recursive:true}); fs.mkdirSync(path.join(dir,".harness/reports/DEV-001-example/fallback"),{recursive:true});
  fs.writeFileSync(path.join(dir,"docs/specs/_active.md"),"---\nactive_spec: DEV-001-example\nstatus: IMPLEMENTING\n---\n"); fs.writeFileSync(path.join(dir,"docs/specs/DEV-001-example/gate.json"),JSON.stringify({planApproval:{status:"approved",contractHash:"a".repeat(64)}})); fs.writeFileSync(path.join(dir,"harness/execution/manifest.json"),fs.readFileSync(path.join(root,"harness/execution/manifest.json")));
  execFileSync("git",["init","-q"],{cwd:dir}); execFileSync("git",["config","user.email","test@example.invalid"],{cwd:dir}); execFileSync("git",["config","user.name","Harness Test"],{cwd:dir}); fs.writeFileSync(path.join(dir,"x.txt"),"x\n"); execFileSync("git",["add","x.txt"],{cwd:dir}); execFileSync("git",["commit","-qm","base"],{cwd:dir});
  const evidence=".harness/reports/DEV-001-example/build.log"; fs.writeFileSync(path.join(dir,evidence),"failed\n");
  const h=createHandoff(dir,{acceptanceId:"AC-001",failedGoal:"fix",strategyId:"cursor-1",strategySummary:"bounded",failureClass:"build",failureSignature:"E",commandsExecuted:[],changedArtifactRefs:[],evidenceRefs:[evidence],cursorDiagnosis:"failed",prohibitedRepeats:["same"]});
  const hp=path.join(dir,".harness/reports/DEV-001-example/fallback",`${h.handoffId}.json`); fs.writeFileSync(hp,JSON.stringify(h,null,2)+"\n");
  claimDiagnosisAttempt(dir,hp); recordDiagnosisComplete(dir,hp);
  const d={schemaVersion:"1.0.0",handoffId:h.handoffId,handoffDigest:sha256File(hp),decision:"alternative_strategy",cursorFailureAssessment:"confirmed",failureClass:"build",repeatStrategy:false,reasoningSummary:"different",materialDifference:"other",alternativeStrategy:"other path",humanRequest:null,resumeCondition:null}; const dp=hp.replace(/\.json$/,"-decision.json"); fs.writeFileSync(dp,JSON.stringify(d,null,2)+"\n");
  assert.equal(validateFallbackForImplementation(dir,dp,"DEV-001-example","AC-001").alternativeStrategy,"other path");
  fs.writeFileSync(path.join(dir,"x.txt"),"changed\n"); assert.throws(()=>validateFallbackForImplementation(dir,dp,"DEV-001-example","AC-001"),/workspace digest is stale/);
});

test("fallback forbids re-diagnosis and a second Codex implementation for the same handoff",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"fallback-once-v131-"));
  fs.mkdirSync(path.join(dir,"docs/specs/DEV-001-example"),{recursive:true}); fs.mkdirSync(path.join(dir,"harness/execution"),{recursive:true}); fs.mkdirSync(path.join(dir,".harness/reports/DEV-001-example/fallback"),{recursive:true});
  fs.writeFileSync(path.join(dir,"docs/specs/_active.md"),"---\nactive_spec: DEV-001-example\nstatus: IMPLEMENTING\n---\n"); fs.writeFileSync(path.join(dir,"docs/specs/DEV-001-example/gate.json"),JSON.stringify({planApproval:{status:"approved",contractHash:"a".repeat(64)}})); fs.writeFileSync(path.join(dir,"harness/execution/manifest.json"),fs.readFileSync(path.join(root,"harness/execution/manifest.json")));
  execFileSync("git",["init","-q"],{cwd:dir}); execFileSync("git",["config","user.email","test@example.invalid"],{cwd:dir}); execFileSync("git",["config","user.name","Harness Test"],{cwd:dir}); fs.writeFileSync(path.join(dir,"x.txt"),"x\n"); execFileSync("git",["add","x.txt"],{cwd:dir}); execFileSync("git",["commit","-qm","base"],{cwd:dir});
  const evidence=".harness/reports/DEV-001-example/build.log"; fs.writeFileSync(path.join(dir,evidence),"failed\n");
  const h=createHandoff(dir,{acceptanceId:"AC-001",failedGoal:"fix",strategyId:"cursor-1",strategySummary:"bounded",failureClass:"build",failureSignature:"E",commandsExecuted:[],changedArtifactRefs:[],evidenceRefs:[evidence],cursorDiagnosis:"failed",prohibitedRepeats:["same"]});
  const hp=path.join(dir,".harness/reports/DEV-001-example/fallback",`${h.handoffId}.json`); fs.writeFileSync(hp,JSON.stringify(h,null,2)+"\n");
  claimDiagnosisAttempt(dir,hp);
  assert.throws(()=>claimDiagnosisAttempt(dir,hp),/re-diagnosis is forbidden/);
  recordDiagnosisComplete(dir,hp);
  assert.throws(()=>claimDiagnosisAttempt(dir,hp),/re-diagnosis is forbidden/);
  const d={schemaVersion:"1.0.0",handoffId:h.handoffId,handoffDigest:sha256File(hp),decision:"alternative_strategy",cursorFailureAssessment:"confirmed",failureClass:"build",repeatStrategy:false,reasoningSummary:"different",materialDifference:"other",alternativeStrategy:"other path",humanRequest:null,resumeCondition:null}; const dp=hp.replace(/\.json$/,"-decision.json"); fs.writeFileSync(dp,JSON.stringify(d,null,2)+"\n");
  recordImplementationAttempt(dir,dp,{outcome:"started"});
  assert.throws(()=>validateFallbackForImplementation(dir,dp,"DEV-001-example","AC-001"),/budget exhausted/);
  assert.throws(()=>recordImplementationAttempt(dir,dp,{outcome:"started"}),/budget exhausted/);
});

test("failed diagnosis claim still consumes the diagnosis budget",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"fallback-claim-v131-"));
  fs.mkdirSync(path.join(dir,"docs/specs/DEV-001-example"),{recursive:true}); fs.mkdirSync(path.join(dir,"harness/execution"),{recursive:true}); fs.mkdirSync(path.join(dir,".harness/reports/DEV-001-example/fallback"),{recursive:true});
  fs.writeFileSync(path.join(dir,"docs/specs/_active.md"),"---\nactive_spec: DEV-001-example\nstatus: IMPLEMENTING\n---\n"); fs.writeFileSync(path.join(dir,"docs/specs/DEV-001-example/gate.json"),JSON.stringify({planApproval:{status:"approved",contractHash:"a".repeat(64)}})); fs.writeFileSync(path.join(dir,"harness/execution/manifest.json"),fs.readFileSync(path.join(root,"harness/execution/manifest.json")));
  execFileSync("git",["init","-q"],{cwd:dir}); execFileSync("git",["config","user.email","test@example.invalid"],{cwd:dir}); execFileSync("git",["config","user.name","Harness Test"],{cwd:dir}); fs.writeFileSync(path.join(dir,"x.txt"),"x\n"); execFileSync("git",["add","x.txt"],{cwd:dir}); execFileSync("git",["commit","-qm","base"],{cwd:dir});
  const evidence=".harness/reports/DEV-001-example/build.log"; fs.writeFileSync(path.join(dir,evidence),"failed\n");
  const h=createHandoff(dir,{acceptanceId:"AC-001",failedGoal:"fix",strategyId:"cursor-1",strategySummary:"bounded",failureClass:"build",failureSignature:"E",commandsExecuted:[],changedArtifactRefs:[],evidenceRefs:[evidence],cursorDiagnosis:"failed",prohibitedRepeats:["same"]});
  const hp=path.join(dir,".harness/reports/DEV-001-example/fallback",`${h.handoffId}.json`); fs.writeFileSync(hp,JSON.stringify(h,null,2)+"\n");
  claimDiagnosisAttempt(dir,hp);
  assert.throws(()=>claimDiagnosisAttempt(dir,hp),/re-diagnosis is forbidden/);
});

test("concurrent diagnosis claims fail closed under exclusive ledger lock", async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"fallback-lock-v131-"));
  fs.mkdirSync(path.join(dir,"docs/specs/DEV-001-example"),{recursive:true}); fs.mkdirSync(path.join(dir,"harness/execution"),{recursive:true}); fs.mkdirSync(path.join(dir,".harness/reports/DEV-001-example/fallback"),{recursive:true});
  fs.writeFileSync(path.join(dir,"docs/specs/_active.md"),"---\nactive_spec: DEV-001-example\nstatus: IMPLEMENTING\n---\n"); fs.writeFileSync(path.join(dir,"docs/specs/DEV-001-example/gate.json"),JSON.stringify({planApproval:{status:"approved",contractHash:"a".repeat(64)}})); fs.writeFileSync(path.join(dir,"harness/execution/manifest.json"),fs.readFileSync(path.join(root,"harness/execution/manifest.json")));
  execFileSync("git",["init","-q"],{cwd:dir}); execFileSync("git",["config","user.email","test@example.invalid"],{cwd:dir}); execFileSync("git",["config","user.name","Harness Test"],{cwd:dir}); fs.writeFileSync(path.join(dir,"x.txt"),"x\n"); execFileSync("git",["add","x.txt"],{cwd:dir}); execFileSync("git",["commit","-qm","base"],{cwd:dir});
  const evidence=".harness/reports/DEV-001-example/build.log"; fs.writeFileSync(path.join(dir,evidence),"failed\n");
  const h=createHandoff(dir,{acceptanceId:"AC-001",failedGoal:"fix",strategyId:"cursor-1",strategySummary:"bounded",failureClass:"build",failureSignature:"E",commandsExecuted:[],changedArtifactRefs:[],evidenceRefs:[evidence],cursorDiagnosis:"failed",prohibitedRepeats:["same"]});
  const hp=path.join(dir,".harness/reports/DEV-001-example/fallback",`${h.handoffId}.json`); fs.writeFileSync(hp,JSON.stringify(h,null,2)+"\n");
  const lockFile=`${hp.replace(/\.json$/,"-ledger.json")}.lock`;
  fs.writeFileSync(lockFile,"held\n");
  try {
    assert.throws(()=>claimDiagnosisAttempt(dir,hp),/locked; concurrent mutation is not allowed/);
  } finally { fs.unlinkSync(lockFile); }
  const worker=path.join(os.tmpdir(),`fallback-claim-worker-${process.pid}-${Date.now()}.mjs`);
  fs.writeFileSync(worker,`import { claimDiagnosisAttempt } from ${JSON.stringify(path.join(root,"scripts/harness/fallback-lib.mjs"))};\ntry { claimDiagnosisAttempt(process.argv[2], process.argv[3]); process.exit(0); } catch (error) { console.error(error.message); process.exit(1); }\n`);
  try {
  const { spawn } = await import("node:child_process");
  const runClaim=()=>new Promise((resolve)=>{
    const child=spawn(process.execPath,[worker,dir,hp],{cwd:dir,stdio:["ignore","pipe","pipe"]});
    let stderr=""; child.stderr.on("data",(d)=>{stderr+=d;});
    child.on("close",(code)=>resolve({code,stderr}));
  });
  const [a,b]=await Promise.all([runClaim(),runClaim()]);
  const codes=[a.code,b.code].sort();
  assert.deepEqual(codes,[0,1]);
  const failed=a.code===0?b:a;
  assert.match(failed.stderr,/re-diagnosis is forbidden|locked; concurrent mutation is not allowed/);
  const ledger=JSON.parse(fs.readFileSync(hp.replace(/\.json$/,"-ledger.json"),"utf8"));
  assert.ok(ledger.diagnosisClaimedAt);
  } finally {
    try { fs.unlinkSync(worker); } catch {}
  }
});

test("Codex fallback diagnosis is fresh/read-only and fallback implementation does not replace reviewer isolation",()=>{
  const diag=fs.readFileSync(path.join(root,"scripts/harness/codex-fallback-diagnose.sh"),"utf8");
  const impl=fs.readFileSync(path.join(root,"scripts/harness/codex-implement.sh"),"utf8");
  const review=fs.readFileSync(path.join(root,"scripts/harness/codex-review.sh"),"utf8");
  assert.match(diag,/--ephemeral\s+--sandbox read-only/); assert.match(diag,/fallback-decision\.schema\.json/);
  assert.match(diag,/claimDiagnosisAttempt/); assert.match(diag,/recordDiagnosisComplete/);
  const claimAt=diag.indexOf("claimDiagnosisAttempt");
  const execAt=diag.indexOf("codex exec");
  assert.ok(claimAt>=0 && execAt>claimAt, "diagnosis claim must precede codex exec");
  assert.match(impl,/FALLBACK_DECISION/); assert.match(impl,/fallback-validate-implementation\.mjs/); assert.match(impl,/validateImplementationArtifact/); assert.match(impl,/autonomous fallback is exhausted/i);
  assert.match(impl,/recordImplementationAttempt/); assert.match(impl,/recordHumanHandoff/);
  const implClaim=impl.indexOf("recordImplementationAttempt");
  const implExec=impl.indexOf("codex exec");
  assert.ok(implClaim>=0 && implExec>implClaim, "implementation attempt must be recorded before codex exec");
  assert.match(review,/--ephemeral/); assert.match(review,/--sandbox read-only/);
});
