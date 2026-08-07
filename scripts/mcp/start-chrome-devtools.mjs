import fs from "node:fs";
import { spawn } from "node:child_process";

function isWsl() {
  if (process.platform !== "linux") return false;
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    return /microsoft|wsl/i.test(fs.readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const args = [
  "-y",
  "chrome-devtools-mcp@latest",
  "--no-usage-statistics",
  "--no-performance-crux",
  "--redact-network-headers",
];

const explicitBrowserUrl = process.env.MCP_CHROME_BROWSER_URL?.trim();
const browserUrl = explicitBrowserUrl || (isWsl() ? "http://127.0.0.1:9222" : "");

if (browserUrl) {
  args.push(`--browser-url=${browserUrl}`);
} else {
  args.push("--isolated");
}

if (process.env.MCP_CHROME_HEADLESS === "1") {
  args.push("--headless=true");
}

const child = spawn(command, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1",
    CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1",
  },
  windowsHide: true,
});

child.on("error", (error) => {
  console.error(`Failed to start Chrome DevTools MCP: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
