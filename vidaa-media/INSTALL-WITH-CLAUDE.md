# Install Home Cinema with Claude Code (Windows)

**For the owner:** open a Claude Code session in the Claude desktop app with `C:\HomeCinema` as its folder, then type:

> Follow INSTALL-WITH-CLAUDE.md

**For Claude:** you're running on the owner's Windows PC, in the Home Cinema folder (`C:\HomeCinema`). Work through the steps below in order.
- Use PowerShell.
- Explain each step in one plain sentence before running it.
- Stop and ask whenever a step needs the owner: an admin/UAC prompt, a choice of folders, a PIN, or anything on the TV.
- Never disable Windows security features (Smart App Control, Defender, firewall). If something is blocked, report exactly what was blocked and suggest the signed alternative.
- After each part, say what worked and what didn't.

## Part 1: Home Cinema server on this PC

1. **Check the files.** `server\server.js`, `web\index.html` and `setup-windows.ps1` must exist in this folder. If they're missing, ask the owner to extract `HomeCinema-Windows.zip` here, so `C:\HomeCinema\server\server.js` exists.
2. **Remove the "downloaded from the internet" mark** so Windows doesn't block the scripts:
   ```powershell
   Get-ChildItem -Recurse | Unblock-File
   ```
3. **Node.js.** Run `node -v`. If it's missing or older than 18, install the official, signed build:
   ```powershell
   winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
   ```
   Refresh PATH in the session, then check `node -v` again. If Smart App Control blocks `node.exe`, run `where.exe node`. If it isn't under `C:\Program Files\nodejs\`, uninstall that copy and install the official one with the command above.
4. **ffmpeg (optional but recommended).**
   ```powershell
   winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
   ```
   If Smart App Control blocks `ffmpeg.exe`, don't work around it. Home Cinema runs without ffmpeg; only video-frame posters, MKV/AVI conversion and audio-language switching are lost. Tell the owner that.
5. **Firewall rule** (private networks only). This needs an admin prompt, so warn the owner first:
   ```powershell
   Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-Command',"New-NetFirewallRule -DisplayName 'Home Cinema (TCP 8080)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -Profile Private"
   ```
   Then check the Wi-Fi category with `Get-NetConnectionProfile`. If it's **Public**, ask the owner to switch it to **Private** (Settings → Network & internet → Wi-Fi → their network). Otherwise the TV can't connect.
6. **Desktop shortcut.** Create `Home Cinema.lnk` on the Desktop pointing to `C:\HomeCinema\start-windows.bat`, with working directory `C:\HomeCinema`, using `WScript.Shell` `CreateShortcut`.
7. **Start the server** in its own window so it keeps running:
   ```powershell
   Start-Process -FilePath "C:\HomeCinema\start-windows.bat" -WorkingDirectory "C:\HomeCinema"
   ```
   Wait about 5 seconds, then check `Invoke-RestMethod http://localhost:8080/api/status`. It should return `scanning` and `version`.
8. **Movie folders.** Ask the owner which folders hold their movies, TV shows and music (e.g. `D:\Movies`, `E:\Music`). Check each with `Test-Path`, then save them:
   ```powershell
   $body = @{ roots = @('D:\Movies','E:\Music'); autoUsb = $true } | ConvertTo-Json
   Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/admin/config -Headers @{ 'X-HC-Admin' = '1' } -ContentType 'application/json' -Body $body
   ```
   Poll `http://localhost:8080/api/admin/config` until `scanning` is false, then report the counts in `summary` (movies, shows, albums).
9. **Guest PIN.** Ask the owner to choose a 4–8 digit PIN. Don't suggest one, and don't repeat it back or write it anywhere. Then:
   ```powershell
   $body = @{ pin = '<THEIR-PIN>' } | ConvertTo-Json
   Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/admin/pin -Headers @{ 'X-HC-Admin' = '1' } -ContentType 'application/json' -Body $body
   ```
10. **TV address.** Read `tvUrls` from `http://localhost:8080/api/admin/config` and tell the owner: on the Hisense TV, open the **Browser** app, type that address (e.g. `http://192.168.1.20:8080`), enter the PIN once, and bookmark it. Suggest a fixed IP for the PC in the router (DHCP reservation) so the bookmark keeps working.
11. Open `http://localhost:8080/admin` in the owner's browser so they can see the setup page.

## Part 2 (optional): Fire TV Stick 4K Select app (Vega OS)

Do this only if the owner asks. Follow `vega-app` steps 1–7 in the Home Cinema repo's `vega-app/README.md`. In short:

1. The owner needs a **free Amazon Developer account** (developer.amazon.com). They sign in themselves; never ask for their password.
2. Install **WSL 2 with Ubuntu** (admin prompt; may need a restart):
   ```powershell
   wsl --install -d Ubuntu-26.04
   ```
   The owner creates the Linux username and password themselves.
3. Inside Ubuntu (`wsl -d Ubuntu-26.04 -- bash -lc "..."`), install the build tools, Node 22 via nvm, and the Vega SDK:
   ```bash
   export NONINTERACTIVE=true SKIP_VVD_INSTALL=true
   curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash
   ```
   Then turn off the SDK's telemetry, as the owner chose:
   ```bash
   ~/vega/telemetry/telemetry -baseDir ~/vega/telemetry -optIn=false
   ```
4. **Developer Mode.** The owner opens Settings → My Fire TV → About on the stick, selects the device name 7 times, then goes to Developer Options → Developer Mode and reads you the code. Run `vega devmode login` (the owner signs in through the link) and `vega devmode enable-device --code <CODE>`.
5. **Connect over Wi-Fi.** The owner sets Developer Options → Connection Mode → **TCP/IP** and tells you the stick's IP. Run:
   ```bash
   vega exec vda connect <IP>:5555
   vega exec vda devices -l
   ```
6. **Install:**
   ```bash
   vega run-app /mnt/c/HomeCinema/dist/HomeCinema-Vega-armv7.vpkg com.homecinema.vega.main
   ```
   If the armv7 package is refused, use `HomeCinema-Vega-aarch64.vpkg`.
7. On the TV, press **Search my network** or type the PC address, then enter the PIN.
8. **Afterwards**, remind the owner to set Connection Mode back from TCP/IP, so the stick's debug port isn't left open.
