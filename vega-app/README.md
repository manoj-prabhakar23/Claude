# Home Cinema for Fire TV Stick 4K Select (Vega OS)

The **Fire TV Stick 4K Select** runs Amazon's **Vega OS**, not Android, so the Android APK in `../firetv-app` can't be installed on it. This folder is the **Vega OS version** of Home Cinema: a small Vega app that opens the same Home Cinema TV screens used on the Hisense VIDAA TV. You get poster tiles, language filters, *Continue watching*, TV shows, and music by album.

- Movies stream from the **Home Cinema server on your PC** (`../vidaa-media`) over Wi-Fi.
- On first launch the app asks for the server address, or **searches your Wi-Fi** for it, and remembers it.
- Remote: arrows / OK to browse, BACK to go back (and exit from the main screen). Use **☰ Server** to change the PC address.
- Formats: MP4 (H.264/HEVC + AAC) plays directly. For MKV, AVI and other formats, install **ffmpeg** on the PC and the server converts them on the fly.
- Not possible on Vega: playing a USB drive plugged into the stick, as far as we know. Plug your drive into the PC instead.

Ready-built packages are in **`../vidaa-media/dist/`**:
- `HomeCinema-Vega-armv7.vpkg`: **use this one for the Fire TV Stick 4K Select** (Amazon's own guide uses armv7 packages on the device).
- `HomeCinema-Vega-aarch64.vpkg`: try this if the armv7 one is refused.

## What it costs

Nothing. The Amazon Developer account and the Vega SDK are free. No AWS or cloud resources are needed.

## One-time setup on Windows 11

Amazon's Vega tools run on macOS/Ubuntu. On Windows they run inside **WSL 2** (Ubuntu inside Windows). Amazon doesn't officially support this, but its developer forum publishes a working guide ([Build and debug a Vega app from Windows 11](https://community.amazondeveloper.com/t/build-and-debug-a-vega-app-from-windows-11/30000)). The steps below follow it.

### 1. Amazon Developer account (free)
Sign up at <https://developer.amazon.com> with your Amazon account and complete the developer profile. The "company / developer name" can be your own name. This account switches on Developer Mode on your stick.

### 2. Ubuntu on Windows (WSL 2)
Open **PowerShell as administrator**:
```powershell
wsl --install -d Ubuntu-26.04
```
Restart if asked, then open **Ubuntu** from the Start menu and create a Linux username and password. Check it runs under WSL 2 (VERSION column shows 2):
```powershell
wsl -l -v
```

### 3. Vega SDK inside Ubuntu
In the Ubuntu window:
```bash
sudo apt update
sudo apt install -y git curl ca-certificates tar xz-utils unzip file gawk jq lz4 build-essential pkg-config python3 python3-dev openjdk-21-jre-headless
export NVM_DIR="$HOME/.nvm"
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh | bash
source "$NVM_DIR/nvm.sh" && nvm install 22 && nvm alias default 22
export NONINTERACTIVE=true SKIP_VVD_INSTALL=true
curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash
source "$HOME/vega/env"
vega --version
```
The SDK sends usage telemetry to Amazon by default. To turn it off:
```bash
~/vega/telemetry/telemetry -baseDir ~/vega/telemetry -optIn=false
```

### 4. Developer Mode on the Fire TV Stick
1. On the stick: **Settings → My Fire TV → About**. Select the device name **7 times**, then go to **Settings → My Fire TV → Developer Options → Developer Mode**. It shows a **validation code**.
2. In Ubuntu:
   ```bash
   vega devmode login            # opens an Amazon sign-in link + code; sign in with your developer account
   vega devmode enable-device --code <CODE-FROM-TV>
   ```
   The stick restarts with Developer Mode on.

### 5. Connect over Wi-Fi (no cable needed)
On the stick: **Developer Options → Connection Mode → TCP/IP** (port 5555). After it restarts, find its IP under **Settings → Network**, then in Ubuntu:
```bash
vega exec vda connect <STICK-IP>:5555
vega exec vda devices -l          # the stick should be listed as "device"
```
*(USB instead: set Connection Mode to USB, connect a USB data cable, and attach the stick to WSL with [usbipd-win](https://learn.microsoft.com/windows/wsl/connect-usb).)*

### 6. Install Home Cinema
Save `HomeCinema-Vega-armv7.vpkg` to your Windows **Downloads** folder. In Ubuntu, Windows drives appear under `/mnt/c`:
```bash
vega run-app /mnt/c/Users/<YourWindowsName>/Downloads/HomeCinema-Vega-armv7.vpkg com.homecinema.vega.main
```
Home Cinema opens on the TV. Next time, start it from **Apps** on the Fire TV home screen. Sideloaded Vega apps show a generic icon.

### 7. First launch
Start the Home Cinema server on your PC (`vidaa-media/start-windows.bat`). On the TV, press **Search my network**, or type the address the server window shows (e.g. `192.168.1.20:8080`) and press **Connect**.

## Rebuilding (only if you change the app)

```bash
cd vega-app
npm install
npm run build:release     # -> build/armv7-release/homecinema_armv7.vpkg (+ aarch64, x86_64)
npm test && npm run lint
```
The TV screens themselves are served by the PC server from `../vidaa-media/web`, so UI changes there need **no** rebuild or reinstall of this app.

## Files
- `src/App.tsx`: the Vega app (WebView, exit and server-change messages, falls back to the connect page if the PC can't be reached)
- `assets/connect.html`: the first-launch connect / network-search screen
- `manifest.toml`: Vega package manifest (WebView, media and keyboard services)
