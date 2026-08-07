param(
    [int]$Port = 9222
)

$ErrorActionPreference = "Stop"

$candidates = @(
    "$env:PROGRAMFILES\Google\Chrome\Application\chrome.exe",
    "${env:PROGRAMFILES(X86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chrome = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $chrome) {
    throw "Google Chrome was not found. Install stable Chrome or set MCP_CHROME_BROWSER_URL manually."
}

$profile = Join-Path $env:TEMP "portfolio-mcp-chrome"
New-Item -ItemType Directory -Path $profile -Force | Out-Null

$arguments = @(
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=$Port",
    "--user-data-dir=$profile",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
)

Start-Process -FilePath $chrome -ArgumentList $arguments

Write-Host ""
Write-Host "Debug Chrome started."
Write-Host "Browser URL: http://127.0.0.1:$Port"
Write-Host "Profile: $profile"
Write-Host ""
Write-Host "Use this isolated Chrome only for local or Preview verification."
Write-Host "Do not sign in to sensitive services."
