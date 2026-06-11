// Electron main process — Director desktop shell.
// Spawns the nitro production server, then loads it in a BrowserWindow.
// Registers a global hotkey to summon the window, and auto-pastes the
// last transcript into whatever app was previously focused.

const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, shell } = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");
const http = require("node:http");

const PORT = Number(process.env.DIRECTOR_PORT || 34117);
const HOTKEY = process.env.DIRECTOR_HOTKEY || "CommandOrControl+Shift+D";

let win = null;
let serverProc = null;

function waitForServer(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) return reject(new Error("server timeout"));
        setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

function startServer() {
  // In a packaged app, resources are under process.resourcesPath/app
  const root = app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");
  const entry = path.join(root, ".output", "server", "index.mjs");
  serverProc = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", NODE_ENV: "production" },
    stdio: "inherit",
    cwd: root,
  });
  serverProc.on("exit", (code) => {
    console.log("[director] server exited", code);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 880,
    height: 720,
    minWidth: 560,
    minHeight: 480,
    show: false,
    backgroundColor: "#1a1a20",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(`http://127.0.0.1:${PORT}/`);
  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function focusWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// Cross-platform "paste into the previously focused app".
// We hide our window first so the OS restores focus to the prior app,
// then dispatch the platform-native paste shortcut via a tiny shell command.
async function autoPasteToPreviousApp() {
  return new Promise((resolve) => {
    const finish = () => setTimeout(resolve, 60);

    const dispatch = () => {
      let cmd;
      let args;
      if (process.platform === "darwin") {
        cmd = "osascript";
        args = ["-e", 'tell application "System Events" to keystroke "v" using command down'];
      } else if (process.platform === "win32") {
        cmd = "powershell.exe";
        args = [
          "-NoProfile",
          "-Command",
          "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')",
        ];
      } else {
        // Linux: requires xdotool (X11) or wtype (Wayland) to be installed.
        cmd = "sh";
        args = [
          "-c",
          "command -v xdotool >/dev/null && xdotool key --clearmodifiers ctrl+v || (command -v wtype >/dev/null && wtype -M ctrl v -m ctrl)",
        ];
      }
      const p = spawn(cmd, args, { stdio: "ignore" });
      p.on("exit", finish);
      p.on("error", finish);
    };

    if (win && win.isVisible()) {
      win.hide();
      setTimeout(dispatch, 120);
    } else {
      dispatch();
    }
  });
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer(PORT);
  } catch (e) {
    console.error("[director]", e);
  }
  createWindow();

  // Global hotkey — summons window and tells renderer to start recording.
  const ok = globalShortcut.register(HOTKEY, () => {
    focusWindow();
    win?.webContents.send("director:hotkey");
  });
  if (!ok) console.warn("[director] failed to register hotkey", HOTKEY);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else focusWindow();
  });
});

ipcMain.handle("director:write-clipboard", (_e, text) => {
  if (typeof text === "string") clipboard.writeText(text);
  return true;
});

ipcMain.handle("director:paste-to-previous-app", async (_e, text) => {
  if (typeof text === "string") clipboard.writeText(text);
  await autoPasteToPreviousApp();
  return true;
});

ipcMain.handle("director:get-info", () => ({
  platform: process.platform,
  hotkey: HOTKEY,
  version: app.getVersion(),
}));

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (serverProc && !serverProc.killed) serverProc.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
