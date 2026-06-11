# Director — Electron desktop build

The web app runs Whisper in the browser. The Electron shell adds:

- **Global hotkey** (default `Cmd/Ctrl+Shift+D`) — summons Director from any app.
- **Auto-paste** — Director hides itself and pastes the transcript into whatever
  app was previously focused.
- **Same UI, same models** — the desktop shell spawns the nitro production
  server on `127.0.0.1` and points a `BrowserWindow` at it.

## One-time setup

```bash
bash scripts/package-electron.sh           # auto-detects current platform
# or explicitly:
bash scripts/package-electron.sh darwin    # macOS
bash scripts/package-electron.sh linux
bash scripts/package-electron.sh win32     # cross-compiles from any host
```

The first run installs `electron` + `@electron/packager` (~150 MB) and writes
the packaged app to `./electron-release/Director-<platform>-x64/`.

## Run during development

```bash
npx vite build                  # produce .output/ (nitro)
npx electron electron/main.cjs  # launches the shell against the local build
```

## Platform notes for auto-paste

- **macOS** — uses AppleScript. The first run will prompt to grant
  *System Settings → Privacy & Security → Accessibility* permission to
  Director (or to the terminal, when running unpackaged).
- **Windows** — uses PowerShell `SendKeys`. No extra setup.
- **Linux** — requires `xdotool` (X11) or `wtype` (Wayland) on `PATH`.

## Customizing the hotkey

Set `DIRECTOR_HOTKEY` before launch — uses Electron's
[accelerator syntax](https://www.electronjs.org/docs/latest/api/accelerator):

```bash
DIRECTOR_HOTKEY="Alt+Space" npx electron electron/main.cjs
```

## What's wired up

```
electron/main.cjs        # spawns nitro server, BrowserWindow, hotkey, auto-paste
electron/preload.cjs     # exposes window.director (clipboard + paste + hotkey events)
src/lib/electron-bridge.ts  # typed renderer-side wrapper
```

When the renderer detects `window.director`, it shows the "desktop mode" footer,
swaps the *auto-copy* toggle for an *auto-paste* toggle, and listens for hotkey
pings from the main process.
