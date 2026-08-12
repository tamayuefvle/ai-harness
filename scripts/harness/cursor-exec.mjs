import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAgainstSchema, schemaFor } from "./artifact-validator.mjs";
import { collectCursorPreflight, createCursorWorktree, cursorCliArgs, defaultRunner, loadCursorManifest, parseChangedFiles, roleCursorConfig } from "./cursor-lib.mjs";
import { normalizeRepoRelative } from "./command-policy.mjs";
import { utcTimestamp } from "./time.mjs";

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");

function argsMap(argv){const out={}; for(let i=0;i<argv.length;i++){const x=argv[i]; if(!x.startsWith("--")) throw new Error(`Unexpected argument: ${x}`); const key=x.slice(2); const value=argv[++i]; if(!value||value.startsWith("--")) throw new Error(`Missing value for --${key}`); out[key]=value;} return out;}
function safeRunId(value){ if(!/^[A-Za-z0-9._-]{1,80}$/.test(value??"")) throw new Error("--run-id must match ^[A-Za-z0-9._-]{1,80}$"); return value; }
function runOrThrow(command,args,options={}){const r=defaultRunner(command,args,options); if(r.exitCode!==0) throw new Error(`${command} ${args.join(" ")} failed: ${String(r.stderr||r.stdout).trim()}`); return r;}
function writeRaw(reportDir, execution){fs.writeFileSync(path.join(reportDir,"raw.json"),String(execution?.stdout||execution?.stderr||""),"utf8");}

function main(){
  const opts=argsMap(process.argv.slice(2));
  const role=opts.role; const runId=safeRunId(opts["run-id"]); const promptRef=normalizeRepoRelative(repoRoot,opts["prompt-file"],"prompt file");
  const manifest=loadCursorManifest(repoRoot); if(!Object.hasOwn(manifest.roles,role)) throw new Error(`Unsupported --role: ${role}`);
  const stat=fs.statSync(promptRef.absolute); if(!stat.isFile()||stat.size>manifest.nonInteractive.maxPromptBytes) throw new Error(`Prompt file must be <= ${manifest.nonInteractive.maxPromptBytes} bytes.`);
  const prompt=fs.readFileSync(promptRef.absolute,"utf8");
  const preflight=collectCursorPreflight(repoRoot); if(preflight.status!=="pass") throw new Error(`Cursor preflight failed: ${preflight.reasonCode}`);
  const startedAt=utcTimestamp();
  const baseHead=runOrThrow("git",["rev-parse","HEAD"],{cwd:repoRoot,timeoutMs:5000}).stdout.trim();
  const worktree=createCursorWorktree(repoRoot,runId,baseHead); const worktreeAbsolute=worktree.absolute; const worktreeRelative=worktree.reference;
  const reportDir=path.join(repoRoot,".harness/reports/cursor",runId); fs.mkdirSync(reportDir,{recursive:true});
  const rawRef=`.harness/reports/cursor/${runId}/raw.json`; const resultRef=`.harness/reports/cursor/${runId}/result.json`;
  let execution={exitCode:1,stdout:"",stderr:"Cursor execution did not start."}; let failureReason=null; let changedFiles=[]; let preserved=true;
  const projectConfigAbsolute=path.join(worktreeAbsolute,manifest.projectConfig);
  try {
    const roleConfig=roleCursorConfig(repoRoot,role); fs.writeFileSync(projectConfigAbsolute,`${JSON.stringify(roleConfig,null,2)}\n`);
    const env={...process.env,HARNESS_CURSOR_ROLE:role,HARNESS_REPO_ROOT:worktreeAbsolute};
    execution=defaultRunner(preflight.binary,cursorCliArgs(repoRoot,role,prompt),{cwd:worktreeAbsolute,env,timeoutMs:manifest.nonInteractive.timeoutSeconds*1000});
    if(execution.exitCode!==0) failureReason=`Cursor CLI exited with code ${execution.exitCode}: ${String(execution.stderr||execution.stdout).trim()}`;
  } catch(error) {
    failureReason=error.message;
    execution={exitCode:1,stdout:execution.stdout??"",stderr:error.message};
  } finally {
    writeRaw(reportDir,execution);
    const restore=defaultRunner("git",["restore","--source=HEAD","--",manifest.projectConfig],{cwd:worktreeAbsolute,timeoutMs:5000});
    if(restore.exitCode!==0) failureReason??=`Could not restore generated Cursor project config: ${String(restore.stderr||restore.stdout).trim()}`;
    const statusResult=defaultRunner("git",["status","--porcelain=v1","--untracked-files=all"],{cwd:worktreeAbsolute,timeoutMs:5000});
    if(statusResult.exitCode===0) changedFiles=parseChangedFiles(statusResult.stdout);
    else failureReason??=`Could not inspect Cursor worktree status: ${String(statusResult.stderr||statusResult.stdout).trim()}`;
  }
  if(role!=="implementer" && changedFiles.length) failureReason="Read-only Cursor worker changed files despite role restrictions.";
  let status=execution.exitCode===0&&!failureReason?"passed":"failed";
  if(role!=="implementer" && changedFiles.length) status="blocked";
  if(role!=="implementer" && changedFiles.length===0){ const rm=defaultRunner("git",["worktree","remove",worktreeAbsolute],{cwd:repoRoot,timeoutMs:30000}); if(rm.exitCode===0) preserved=false; else failureReason??=`Could not remove clean read-only worktree: ${String(rm.stderr||rm.stdout).trim()}`; }
  const result={schemaVersion:"1.0.0",runId,logicalExecutor:"cursor",transport:"cursor-cli",role,status,exitCode:execution.exitCode??null,baseHead,worktree:{path:worktreeRelative,preserved,autoApplied:false},rawOutputRef:rawRef,changedFiles,startedAt,finishedAt:utcTimestamp(),failureReason};
  validateAgainstSchema(result,schemaFor("cursorAgentResult"),"Cursor agent result");
  fs.writeFileSync(path.join(reportDir,"result.json"),`${JSON.stringify(result,null,2)}\n`);
  console.log(JSON.stringify({...result,resultRef},null,2));
  process.exitCode=status==="passed"?0:1;
}
try{main();}catch(error){console.error(error.message);process.exit(1)}
