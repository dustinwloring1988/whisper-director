// Bridge to the Electron preload API. Safe no-op in the browser.
export type DirectorInfo = { platform: string; hotkey: string; version: string };

type Director = {
  isElectron: true;
  getInfo(): Promise<DirectorInfo>;
  writeClipboard(text: string): Promise<boolean>;
  pasteToPreviousApp(text: string): Promise<boolean>;
  onHotkey(cb: () => void): () => void;
};

declare global {
  interface Window {
    director?: Director;
  }
}

export function getDirector(): Director | null {
  if (typeof window === "undefined") return null;
  return window.director ?? null;
}

export const isElectron = () => !!getDirector();
