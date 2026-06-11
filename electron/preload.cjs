// Preload — exposes a minimal, typed API on window.director.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("director", {
  isElectron: true,
  getInfo: () => ipcRenderer.invoke("director:get-info"),
  writeClipboard: (text) => ipcRenderer.invoke("director:write-clipboard", text),
  pasteToPreviousApp: (text) => ipcRenderer.invoke("director:paste-to-previous-app", text),
  onHotkey: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("director:hotkey", listener);
    return () => ipcRenderer.removeListener("director:hotkey", listener);
  },
});
