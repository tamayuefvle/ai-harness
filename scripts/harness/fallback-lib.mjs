import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function loadFallback(root){return JSON.parse(fs.readFileSync(path.join(root,"harness/fallback/manifest.json"),"utf8"));}
export function isHumanFirst(reason,root){return loadFallback(root).humanFirstReasons.includes(reason);}
export function readJson(file){return JSON.parse(fs.readFileSync(file,"utf8"));}
export function sha256File(file){return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");}
export function gitHead(root){return execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();}
export function gitWorkspaceDigest(root){
  const rawStatus=execFileSync("git",["status","--porcelain=v1","-uall"],{cwd:root,encoding:"utf8"});
  const statusLines=rawStatus.split(/\r?\n/).filter((line)=>line && !line.slice(3).replaceAll("\\","/").startsWith(".harness/"));
  const status=statusLines.join("\n");
  const diff=execFileSync("git",["diff","--binary","HEAD","--",":(exclude).harness/**"],{cwd:root,encoding:"utf8",maxBuffer:16*1024*1024});
  const untracked=[];
  for(const line of statusLines) if(line.startsWith("?? ")){
    const rel=line.slice(3); const absolute=path.resolve(root,rel);
    if(absolute.startsWith(path.resolve(root)+path.sep) && fs.existsSync(absolute) && fs.lstatSync(absolute).isFile() && !fs.lstatSync(absolute).isSymbolicLink()) untracked.push(`${rel}:${sha256File(absolute)}`);
  }
  return crypto.createHash("sha256").update(`${status}\n---DIFF---\n${diff}\n---UNTRACKED---\n${untracked.sort().join("\n")}`).digest("hex");
}
export function activeTask(root){const txt=fs.readFileSync(path.join(root,"docs/specs/_active.md"),"utf8"); return {id:txt.match(/active_spec:\s*(\S+)/)?.[1],status:txt.match(/status:\s*(\S+)/)?.[1]};}
function assertEvidence(root,ref){
  if(typeof ref!=="string"||path.isAbsolute(ref)||ref.split(/[\\/]/).includes("..")) throw new Error(`Unsafe fallback evidence path: ${ref}`);
  const absolute=path.resolve(root,ref); const base=path.resolve(root);
  if(!absolute.startsWith(base+path.sep)||!fs.existsSync(absolute)||fs.lstatSync(absolute).isSymbolicLink()||!fs.lstatSync(absolute).isFile()) throw new Error(`Fallback evidence must be an existing non-symlink repository file: ${ref}`);
}
export function createHandoff(root,input){
  const active=activeTask(root); if(!active.id||active.id==="none") throw new Error("No active task.");
  if(input.taskId&&input.taskId!==active.id) throw new Error("Fallback handoff task must match the active task.");
  const gate=readJson(path.join(root,"docs/specs",active.id,"gate.json"));
  if(gate.designApproval?.status!=="approved"||!/^[a-f0-9]{64}$/.test(gate.designApproval?.contractHash??"")) throw new Error("Fallback requires an approved design digest.");
  if(!/^AC-[0-9]{3,}$/.test(input.acceptanceId??"")) throw new Error("Fallback requires an explicit acceptanceId.");
  for(const field of ["failedGoal","strategyId","strategySummary","failureClass","failureSignature","cursorDiagnosis"]) if(typeof input[field]!=="string"||!input[field].trim()) throw new Error(`Fallback requires ${field}.`);
  if(!(input.evidenceRefs??[]).length) throw new Error("Fallback requires failure evidence before delegation.");
  for(const ref of input.evidenceRefs) assertEvidence(root,ref);
  if(!(input.prohibitedRepeats??[]).length) throw new Error("Fallback must record at least one prohibited repeat.");
  const suffix=crypto.randomBytes(4).toString("hex"); const now=new Date().toISOString();
  return {schemaVersion:"1.0.0",handoffId:`FBH-${active.id}-${input.acceptanceId}-${suffix}`,taskId:active.id,acceptanceId:input.acceptanceId,sourceExecutor:"cursor",targetExecutor:"codex-cli",failedGoal:input.failedGoal,strategyId:input.strategyId,strategySummary:input.strategySummary,failureClass:input.failureClass,failureSignature:input.failureSignature,commandsExecuted:input.commandsExecuted??[],changedArtifactRefs:input.changedArtifactRefs??[],evidenceRefs:input.evidenceRefs,cursorDiagnosis:input.cursorDiagnosis,prohibitedRepeats:input.prohibitedRepeats,approvedDesignDigest:gate.designApproval.contractHash,head:gitHead(root),workspaceDigest:gitWorkspaceDigest(root),createdAt:now};
}
export function validateHandoffCurrent(root,handoffPath){
  const h=readJson(handoffPath); const active=activeTask(root);
  if(h.taskId!==active.id) throw new Error("Fallback handoff is not bound to the active task.");
  const gate=readJson(path.join(root,"docs/specs",h.taskId,"gate.json"));
  if(h.approvedDesignDigest!==gate.designApproval?.contractHash) throw new Error("Fallback handoff design digest is stale.");
  if(h.head!==gitHead(root)) throw new Error("Fallback handoff HEAD is stale.");
  if(h.workspaceDigest!==gitWorkspaceDigest(root)) throw new Error("Fallback handoff workspace digest is stale.");
  return h;
}
export function assertFallbackDecision(decision,handoff,handoffDigest){
  if(decision.handoffId!==handoff.handoffId) throw new Error("Fallback decision is bound to a different handoff.");
  if(decision.handoffDigest!==handoffDigest) throw new Error("Fallback decision handoff digest does not match.");
  if(decision.repeatStrategy!==false) throw new Error("Fallback decision may not repeat the failed strategy.");
  if(decision.decision==="alternative_strategy"){
    if(!decision.materialDifference||!decision.alternativeStrategy) throw new Error("Alternative strategy requires materialDifference and alternativeStrategy.");
    const hay=`${decision.materialDifference}\n${decision.alternativeStrategy}`.toLowerCase();
    for(const item of handoff.prohibitedRepeats??[]) if(item&&hay.includes(item.toLowerCase())) throw new Error("Alternative strategy repeats a prohibited failed strategy.");
  }
  return true;
}
export function validateFallbackForImplementation(root,decisionPath,task,acceptanceId){
  const decision=readJson(decisionPath); const handoffPath=path.join(path.dirname(decisionPath),`${decision.handoffId}.json`);
  if(!fs.existsSync(handoffPath)||fs.lstatSync(handoffPath).isSymbolicLink()) throw new Error("Bound fallback handoff is missing or unsafe.");
  const h=validateHandoffCurrent(root,handoffPath); assertFallbackDecision(decision,h,sha256File(handoffPath));
  if(h.taskId!==task||h.acceptanceId!==acceptanceId) throw new Error("Fallback decision binding does not match active task/acceptance criterion.");
  if(decision.decision!=="alternative_strategy") throw new Error("Fallback implementation requires alternative_strategy.");
  assertImplementationAllowed(root,decisionPath);
  return {handoffPath,materialDifference:decision.materialDifference,alternativeStrategy:decision.alternativeStrategy,decisionDigest:sha256File(decisionPath)};
}

function ledgerPath(root,taskId,handoffId){
  return path.join(root,".harness","reports",taskId,"fallback",`${handoffId}-ledger.json`);
}

function emptyLedger(taskId,handoffId){
  return {schemaVersion:"1.0.0",handoffId,taskId,diagnosisClaimedAt:null,diagnosisAt:null,implementationAttempts:[],humanHandoffAt:null};
}

export function readFallbackLedger(root,taskId,handoffId){
  const file=ledgerPath(root,taskId,handoffId);
  if(!fs.existsSync(file)) return emptyLedger(taskId,handoffId);
  if(fs.lstatSync(file).isSymbolicLink()) throw new Error("Fallback ledger must not be a symbolic link.");
  return {...emptyLedger(taskId,handoffId),...readJson(file)};
}

function writeFallbackLedger(root,ledger){
  const file=ledgerPath(root,ledger.taskId,ledger.handoffId);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,`${JSON.stringify(ledger,null,2)}\n`);
  return file;
}

function withLedgerLock(root,taskId,handoffId,action){
  const file=ledgerPath(root,taskId,handoffId);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const lockFile=`${file}.lock`;
  let fd;
  try {
    fd=fs.openSync(lockFile,"wx");
  } catch (error) {
    if(error?.code==="EEXIST") throw new Error("Fallback ledger is locked; concurrent mutation is not allowed.");
    throw error;
  }
  try {
    try {
      fs.writeFileSync(fd,`${JSON.stringify({pid:process.pid,acquiredAt:new Date().toISOString()})}\n`);
    } catch (error) {
      throw error;
    }
    return action(readFallbackLedger(root,taskId,handoffId));
  } finally {
    try { if(fd!==undefined) fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(lockFile); } catch {}
  }
}

function assertDiagnosisBudget(ledger){
  if(ledger.humanHandoffAt) throw new Error("Fallback handoff already transferred to human; autonomous diagnosis is closed.");
  if(ledger.diagnosisClaimedAt||ledger.diagnosisAt) throw new Error("Fallback diagnosis already claimed for this handoff; re-diagnosis is forbidden.");
  if((ledger.implementationAttempts??[]).length) throw new Error("Fallback implementation already started for this handoff; re-diagnosis is forbidden.");
}

export function assertDiagnosisAllowed(root,handoffPath){
  const handoff=validateHandoffCurrent(root,handoffPath);
  assertDiagnosisBudget(readFallbackLedger(root,handoff.taskId,handoff.handoffId));
  return handoff;
}

export function claimDiagnosisAttempt(root,handoffPath){
  const handoff=validateHandoffCurrent(root,handoffPath);
  return withLedgerLock(root,handoff.taskId,handoff.handoffId,(ledger)=>{
    assertDiagnosisBudget(ledger);
    ledger.diagnosisClaimedAt=new Date().toISOString();
    writeFallbackLedger(root,ledger);
    return ledger;
  });
}

export function recordDiagnosisComplete(root,handoffPath){
  const handoff=validateHandoffCurrent(root,handoffPath);
  return withLedgerLock(root,handoff.taskId,handoff.handoffId,(ledger)=>{
    if(ledger.humanHandoffAt) throw new Error("Fallback handoff already transferred to human; autonomous diagnosis is closed.");
    if(!ledger.diagnosisClaimedAt) throw new Error("Fallback diagnosis completion requires a prior diagnosis claim.");
    if(ledger.diagnosisAt) throw new Error("Fallback diagnosis already recorded for this handoff; re-diagnosis is forbidden.");
    ledger.diagnosisAt=new Date().toISOString();
    writeFallbackLedger(root,ledger);
    return ledger;
  });
}

export function assertImplementationAllowed(root,decisionPath){
  const decision=readJson(decisionPath);
  const handoffPath=path.join(path.dirname(decisionPath),`${decision.handoffId}.json`);
  const handoff=validateHandoffCurrent(root,handoffPath);
  const ledger=readFallbackLedger(root,handoff.taskId,handoff.handoffId);
  if(ledger.humanHandoffAt) throw new Error("Fallback already handed to human; autonomous implementation is closed.");
  if(!ledger.diagnosisAt) throw new Error("Fallback implementation requires a recorded diagnosis for this handoff.");
  if((ledger.implementationAttempts??[]).length>0) throw new Error("Fallback implementation budget exhausted for this handoff (max one Codex strategy).");
  return {handoff,ledger,decisionDigest:sha256File(decisionPath)};
}

export function recordImplementationAttempt(root,decisionPath,{outcome="started"}={}){
  const decision=readJson(decisionPath);
  const handoffPath=path.join(path.dirname(decisionPath),`${decision.handoffId}.json`);
  const handoff=validateHandoffCurrent(root,handoffPath);
  const decisionDigest=sha256File(decisionPath);
  return withLedgerLock(root,handoff.taskId,handoff.handoffId,(ledger)=>{
    if(ledger.humanHandoffAt) throw new Error("Fallback already handed to human; autonomous implementation is closed.");
    if(!ledger.diagnosisAt) throw new Error("Fallback implementation requires a recorded diagnosis for this handoff.");
    if((ledger.implementationAttempts??[]).length>0) throw new Error("Fallback implementation budget exhausted for this handoff (max one Codex strategy).");
    ledger.implementationAttempts.push({decisionDigest,startedAt:new Date().toISOString(),outcome});
    writeFallbackLedger(root,ledger);
    return ledger;
  });
}

export function recordHumanHandoff(root,decisionPath){
  const decision=readJson(decisionPath);
  const handoffPath=path.join(path.dirname(decisionPath),`${decision.handoffId}.json`);
  const handoff=readJson(handoffPath);
  return withLedgerLock(root,handoff.taskId,handoff.handoffId,(ledger)=>{
    ledger.humanHandoffAt=new Date().toISOString();
    writeFallbackLedger(root,ledger);
    return ledger;
  });
}
