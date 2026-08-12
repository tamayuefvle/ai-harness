import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"PACKAGE_MANIFEST.json"),"utf8"));
const version=pkg.version;
const expected=[
  ["README_HARNESS.md",new RegExp(`^# AI Development Harness v${version.replaceAll('.', '\\.')}$`,'m')],
  ["SECURITY.md",new RegExp(`^# Security policy — AI Development Harness v${version.replaceAll('.', '\\.')}$`,'m')],
  ["NEW_REPOSITORY_SETUP.md",new RegExp(`^# New Repository Setup — v${version.replaceAll('.', '\\.')}$`,'m')],
  ["MIGRATION.md",new RegExp(`^# Migration to v${version.replaceAll('.', '\\.')}$`,'m')]
];
const failures=[];
for(const [relative,pattern] of expected){const text=fs.readFileSync(path.join(root,relative),"utf8"); if(!pattern.test(text)) failures.push(`${relative}: current-version heading is not ${version}`);}
if(failures.length){console.error("Current release metadata drift detected:"); for(const f of failures) console.error(`- ${f}`); process.exit(1)}
console.log(`[PASS] Current release metadata is synchronized at v${version}.`);
