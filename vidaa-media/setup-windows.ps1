# Home Cinema - one-time setup for Windows 10/11.
# Installs Node.js and ffmpeg (if missing), lets your TV reach port 8080 on private
# networks, creates a "Home Cinema" desktop shortcut, then starts the app.
# Run it by double-clicking setup-windows.bat.

$ErrorActionPreference = 'Stop'
$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $AppDir
$Port = 8080
if (Test-Path "$AppDir\config.json") {
    try { $p = (Get-Content "$AppDir\config.json" -Raw | ConvertFrom-Json).port; if ($p) { $Port = [int]$p } } catch { }
}

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Yellow }
function Ok($text) { Write-Host "    $text" -ForegroundColor Green }
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Write-Host "Home Cinema setup" -ForegroundColor Cyan

# 1. Node.js
Step "Checking Node.js"
if (Has 'node') { Ok "Node.js $(node -v) is installed" }
elseif (Has 'winget') {
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    Refresh-Path
    if (Has 'node') { Ok "Node.js $(node -v) installed" } else { Write-Host "    Node.js was installed - close this window and run setup again." -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }
} else {
    Write-Host "    Please install Node.js LTS from https://nodejs.org, then run this setup again." -ForegroundColor Red
    Start-Process 'https://nodejs.org'; Read-Host "Press Enter to exit"; exit 1
}

# 2. ffmpeg (posters from video, MKV/AVI playback on the TV, audio-language switching)
Step "Checking ffmpeg"
if (Has 'ffmpeg') { Ok "ffmpeg is installed" }
elseif (Has 'winget') {
    winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
    Refresh-Path
    if (Has 'ffmpeg') { Ok "ffmpeg installed" } else { Ok "ffmpeg installed - it will be available after you restart Home Cinema" }
} else { Write-Host "    winget not found - install ffmpeg later from https://www.gyan.dev/ffmpeg/builds/ (optional)" -ForegroundColor DarkYellow }

# 3. Firewall: allow the TV to connect (private networks only)
Step "Allowing your TV to connect (Windows Firewall, private networks only)"
$ruleName = "Home Cinema (TCP $Port)"
$exists = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($exists) { Ok "Firewall rule already present" }
else {
    $cmd = "New-NetFirewallRule -DisplayName '$ruleName' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private | Out-Null"
    try {
        Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile', '-Command', $cmd
        if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) { Ok "Firewall rule added" } else { throw "not added" }
    } catch {
        Write-Host "    Skipped (administrator permission was not given). Windows will ask the first time the TV connects - choose 'Private networks'." -ForegroundColor DarkYellow
    }
}
$profiles = Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Public' }
if ($profiles) {
    Write-Host "    Note: your Wi-Fi '$($profiles[0].Name)' is set to Public. Set it to Private (Settings > Network & internet > Wi-Fi > your network) so the TV can connect." -ForegroundColor DarkYellow
}

# 4. Desktop shortcut
Step "Creating the 'Home Cinema' desktop shortcut"
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'Home Cinema.lnk'
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnk)
$sc.TargetPath = Join-Path $AppDir 'start-windows.bat'
$sc.WorkingDirectory = $AppDir
$sc.Description = 'Home Cinema media server for your TV'
$sc.Save()
Ok "Shortcut created: $lnk"

# 5. Start
Step "Starting Home Cinema"
Write-Host "    The setup page opens in your browser. Add your movie folders there." -ForegroundColor Cyan
& (Join-Path $AppDir 'start-windows.bat')
