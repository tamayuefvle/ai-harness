import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function queryCodexHooks(cwd, options = {}) {
  const command = options.command ?? "codex";
  const args = options.args ?? ["app-server"];
  const timeoutMs = options.timeoutMs ?? 8000;
  const repoCwd = path.resolve(cwd);

  return new Promise((resolve, reject) => {
    let settled = false;
    let nextId = 1;
    let stdoutBuffer = "";
    const pending = new Map();
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: repoCwd,
    });

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch {}
      fn(value);
    };
    const succeed = (value) => finish(resolve, value);
    const fail = (error) => finish(reject, error instanceof Error ? error : new Error(String(error)));

    const timer = setTimeout(() => {
      fail(new Error(`timed out waiting for Codex hooks/list after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (error) => fail(error));
    child.on("exit", (code, signal) => {
      if (!settled) fail(new Error(`codex app-server exited before hooks/list completed (code=${code}, signal=${signal ?? "none"})`));
    });

    function handleMessage(message) {
      if (message == null || typeof message !== "object") return;
      if (message.id == null || !pending.has(message.id)) return;
      const { resolveRequest, rejectRequest } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        const detail = typeof message.error === "string" ? message.error : message.error.message ?? JSON.stringify(message.error);
        rejectRequest(new Error(`protocol error from ${command}: ${detail}`));
        return;
      }
      resolveRequest(message.result);
    }

    function consumeStdout(chunk) {
      stdoutBuffer += chunk;
      let newline = stdoutBuffer.indexOf("\n");
      while (newline >= 0) {
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (line) {
          try { handleMessage(JSON.parse(line)); } catch {}
        }
        newline = stdoutBuffer.indexOf("\n");
      }
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", consumeStdout);

    function sendRequest(method, params) {
      const id = nextId++;
      const promise = new Promise((resolveRequest, rejectRequest) => {
        pending.set(id, { resolveRequest, rejectRequest });
      });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      return promise;
    }

    function sendNotification(method, params = {}) {
      child.stdin.write(`${JSON.stringify({ method, params })}\n`);
    }

    (async () => {
      try {
        await sendRequest("initialize", {
          clientInfo: {
            name: "ai_harness_preflight",
            title: "AI Harness Preflight",
            version: "1.0.0",
          },
        });
        sendNotification("initialized");
        const result = await sendRequest("hooks/list", { cwds: [repoCwd] });
        succeed(result);
      } catch (error) {
        fail(error);
      }
    })();
  });
}

async function main() {
  const cwdFlag = process.argv.indexOf("--cwd");
  const cwd = cwdFlag >= 0 ? process.argv[cwdFlag + 1] : process.cwd();
  if (!cwd) {
    console.error("Usage: node scripts/harness/codex-hooks-list.mjs --cwd <repo>");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await queryCodexHooks(cwd);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
