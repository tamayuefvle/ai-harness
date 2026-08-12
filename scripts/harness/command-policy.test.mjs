import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeCommandSpec, validateCommandSpec } from "./command-policy.mjs";

function root(){ return fs.mkdtempSync(path.join(os.tmpdir(),"command-policy-")); }
const spec=(overrides={})=>({executable:"node",args:["script.mjs"],cwd:".",timeoutSeconds:10,network:false,...overrides});

test("command policy rejects repository escape, shell interpreters, secrets, and unapproved network",()=>{
  const r=root(); try{
    assert.throws(()=>validateCommandSpec(r,spec({cwd:"../outside"}),{allowedExecutables:new Set(["node"])}),/escapes repository/);
    assert.throws(()=>validateCommandSpec(r,spec({executable:"bash",args:["-lc","echo x"]}),{allowedExecutables:new Set(["bash"])}),/forbidden/);
    assert.throws(()=>validateCommandSpec(r,spec({args:["script.mjs","ghp_"+"abcdefghijklmnopqrstuvwxyz123456"]}),{allowedExecutables:new Set(["node"])}),/secret/);
    assert.throws(()=>validateCommandSpec(r,spec({network:true}),{allowedExecutables:new Set(["node"]),allowNetwork:false}),/Network-enabled/);
  } finally { fs.rmSync(r,{recursive:true,force:true}); }
});

test("structured command execution does not interpret shell metacharacters",()=>{
  const r=root(); try{
    fs.writeFileSync(path.join(r,"script.mjs"),"import fs from 'node:fs'; fs.writeFileSync('observed.txt', process.argv[2]);\n");
    const attack="safe; touch pwned.txt && echo unsafe";
    const result=executeCommandSpec(r,spec({args:["script.mjs",attack]}),{allowedExecutables:new Set(["node"]),stdio:"pipe"});
    assert.equal(result.status,"passed");
    assert.equal(fs.readFileSync(path.join(r,"observed.txt"),"utf8"),attack);
    assert.equal(fs.existsSync(path.join(r,"pwned.txt")),false);
  } finally { fs.rmSync(r,{recursive:true,force:true}); }
});

test("dangerous git and inline-code forms fail closed",()=>{
  const r=root(); try{
    assert.throws(()=>validateCommandSpec(r,{executable:"git",args:["reset","--hard"],cwd:".",timeoutSeconds:10,network:false},{allowedExecutables:new Set(["git"])}),/forbidden/);
    assert.throws(()=>validateCommandSpec(r,{executable:"node",args:["-e","console.log(1)"],cwd:".",timeoutSeconds:10,network:false},{allowedExecutables:new Set(["node"])}),/Inline code/);
  } finally { fs.rmSync(r,{recursive:true,force:true}); }
});
