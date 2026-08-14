import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { queryCodexHooks } from "./codex-hooks-list.mjs";

test("queryCodexHooks reads trusted project hooks from app-server hooks/list", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hooks-list-"));
  const serverPath = path.join(root, "fake-app-server.mjs");
  fs.writeFileSync(serverPath, `let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf("\\n");
  while (newline >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) {
      const message = JSON.parse(line);
      if (message.method === "initialize") {
        process.stdout.write(JSON.stringify({ id: message.id, result: { ok: true } }) + "\\n");
      }
      if (message.method === "hooks/list") {
        const cwd = message.params.cwds[0];
        process.stdout.write(JSON.stringify({
          id: message.id,
          result: {
            data: [{
              cwd,
              errors: [],
              hooks: [{
                source: "project",
                enabled: true,
                isManaged: false,
                currentHash: "abc",
                trustStatus: "trusted",
                sourcePath: cwd + "/.codex/hooks.json",
              }],
            }],
          },
        }) + "\\n");
      }
    }
    newline = buffer.indexOf("\\n");
  }
});
process.stdin.on("end", () => process.exit(0));
`);
  const result = await queryCodexHooks(root, {
    command: process.execPath,
    args: [serverPath],
    timeoutMs: 5000,
  });
  const hook = result.data[0].hooks[0];
  assert.equal(hook.trustStatus, "trusted");
  assert.equal(hook.source, "project");
  assert.equal(hook.enabled, true);
});
