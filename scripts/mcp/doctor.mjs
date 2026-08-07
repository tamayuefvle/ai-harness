import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const findings = [];

function result(name, status, detail) {
  findings.push({ name, status, detail });
}

function commandExists(command, args = ["--version"]) {
  try {
    const output = execFileSync(command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    }).trim();
    return output.split("\n")[0] || "available";
  } catch {
    return null;
  }
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
result(
  "Node.js",
  nodeMajor >= 20 ? "pass" : "fail",
  `v${process.versions.node}; Chrome DevTools MCP requires a current Node LTS.`,
);

result(
  "Cursor MCP config",
  fs.existsSync(path.join(repoRoot, ".cursor/mcp.json")) ? "pass" : "fail",
  ".cursor/mcp.json",
);

result(
  "Codex MCP config",
  fs.existsSync(path.join(repoRoot, ".codex/config.toml")) ? "pass" : "fail",
  ".codex/config.toml",
);


const codexVersion = commandExists(process.platform === "win32" ? "codex.cmd" : "codex");
result(
  "Codex CLI",
  codexVersion ? "pass" : "warn",
  codexVersion ?? "Codex CLI was not found on PATH.",
);

const cursorAgentVersion = commandExists(
  process.platform === "win32" ? "cursor-agent.cmd" : "cursor-agent",
);
result(
  "Cursor Agent CLI",
  cursorAgentVersion ? "pass" : "info",
  cursorAgentVersion ?? "Optional; verify MCP from Cursor Settings instead.",
);

function isWsl() {
  if (process.platform !== "linux") return false;
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    return /microsoft|wsl/i.test(fs.readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

async function checkChromeEndpoint() {
  const target = process.env.MCP_CHROME_BROWSER_URL ||
    (isWsl() ? "http://127.0.0.1:9222" : null);

  if (!target) {
    result(
      "Chrome debug endpoint",
      "info",
      "Native environment: Chrome DevTools MCP will launch an isolated browser.",
    );
    return;
  }

  const url = new URL("/json/version", target);
  await new Promise((resolve) => {
    const request = http.get(url, { timeout: 1500 }, (response) => {
      response.resume();
      result(
        "Chrome debug endpoint",
        response.statusCode === 200 ? "pass" : "warn",
        `${target} returned HTTP ${response.statusCode}.`,
      );
      resolve();
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", () => {
      result(
        "Chrome debug endpoint",
        "warn",
        `${target} is unavailable. On Windows run scripts/mcp/start-debug-chrome.ps1.`,
      );
      resolve();
    });
  });
}

await checkChromeEndpoint();

console.log("MCP doctor\n");
for (const item of findings) {
  console.log(`[${item.status.toUpperCase()}] ${item.name}: ${item.detail}`);
}

const failures = findings.filter((item) => item.status === "fail");
process.exit(failures.length > 0 ? 1 : 0);
