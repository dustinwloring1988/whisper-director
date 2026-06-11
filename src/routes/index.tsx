import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useRecorder } from "@/hooks/use-recorder";
import { transcribe } from "@/lib/whisper";
import { getDirector, type DirectorInfo } from "@/lib/electron-bridge";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Director — local speech to text" },
      {
        name: "description",
        content:
          "Director runs Whisper locally in your browser to turn speech into text you can paste anywhere.",
      },
      { property: "og:title", content: "Director — local speech to text" },
      {
        property: "og:description",
        content: "Private, on-device dictation powered by Whisper.",
      },
    ],
  }),
  component: DirectorApp,
});

const MODELS = [
  { id: "onnx-community/whisper-tiny.en", label: "tiny.en", size: "~40MB", note: "fastest" },
  { id: "onnx-community/whisper-base.en", label: "base.en", size: "~80MB", note: "balanced" },
  { id: "onnx-community/whisper-small.en", label: "small.en", size: "~240MB", note: "accurate" },
];

type HistoryItem = { id: string; text: string; at: number; ms: number };

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

function DirectorApp() {
  const recorder = useRecorder();
  const [modelId, setModelId] = useState(MODELS[0].id);
  const [busy, setBusy] = useState(false);
  const [loadStatus, setLoadStatus] = useState<string>("");
  const [loadPct, setLoadPct] = useState<number>(0);
  const [transcript, setTranscript] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [autoCopy, setAutoCopy] = useState(true);
  const [autoPaste, setAutoPaste] = useState(true);
  const [hasGPU, setHasGPU] = useState<boolean | null>(null);
  const [electronInfo, setElectronInfo] = useState<DirectorInfo | null>(null);
  const handleToggleRef = useRef<() => void>(() => {});


  useEffect(() => {
    setHasGPU(typeof navigator !== "undefined" && !!(navigator as any).gpu);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("director.history");
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("director.history", JSON.stringify(history.slice(0, 25)));
    } catch {}
  }, [history]);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, []);

  const handleToggle = useCallback(async () => {
    if (recorder.state === "recording") {
      const blob = await recorder.stop();
      if (!blob) return;
      setBusy(true);
      const t0 = performance.now();
      setLoadStatus("preparing model");
      setLoadPct(0);
      try {
        const text = await transcribe(blob, modelId, (m: any) => {
          if (m.status === "progress" && typeof m.progress === "number") {
            setLoadStatus(`downloading ${m.file ?? "model"}`);
            setLoadPct(Math.round(m.progress));
          } else if (m.status === "ready" || m.status === "done") {
            setLoadStatus("transcribing");
            setLoadPct(100);
          } else if (m.status) {
            setLoadStatus(m.status);
          }
        });
        const ms = performance.now() - t0;
        setTranscript(text);
        if (text) {
          setHistory((h) => [{ id: crypto.randomUUID(), text, at: Date.now(), ms }, ...h].slice(0, 25));
          if (autoCopy) await copy(text);
        }
      } catch (e: any) {
        setTranscript(`[error] ${e?.message ?? "transcription failed"}`);
      } finally {
        setBusy(false);
        setLoadStatus("");
        setLoadPct(0);
      }
    } else {
      setTranscript("");
      await recorder.start();
    }
  }, [recorder, modelId, autoCopy, copy]);

  // Spacebar to record (when not typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tgt = e.target as HTMLElement;
      if (tgt?.tagName === "INPUT" || tgt?.tagName === "TEXTAREA") return;
      e.preventDefault();
      if (!busy) handleToggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleToggle, busy]);

  const bars = useMemo(() => Array.from({ length: 32 }, (_, i) => i), []);
  const isRecording = recorder.state === "recording";

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" />

      {/* Top bar */}
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 pt-6">
        <div className="flex items-center gap-3">
          <div className="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface">
            <div className={`h-1.5 w-1.5 rounded-full ${isRecording ? "bg-signal signal-pulse" : "bg-muted-foreground"}`} />
          </div>
          <div className="font-mono text-sm tracking-tight">
            director<span className="text-muted-foreground">.stt</span>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <span className="rounded border border-border bg-surface px-2 py-1">
            {hasGPU == null ? "…" : hasGPU ? "webgpu" : "wasm"}
          </span>
          <span className="hidden rounded border border-border bg-surface px-2 py-1 sm:inline">
            on-device
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-6 pb-24 pt-16 sm:pt-24">
        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            local · private · whisper
          </div>
          <h1 className="text-balance text-4xl font-medium tracking-tight sm:text-5xl">
            Speak. Paste anywhere.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-balance text-sm text-muted-foreground">
            Director runs Whisper directly in your browser. Hit record, talk, and the
            transcript lands on your clipboard.
          </p>
        </div>

        {/* Recorder card */}
        <div className="relative rounded-xl border border-border bg-surface/60 backdrop-blur-sm">
          {/* Visualizer */}
          <div className="flex h-32 items-center justify-center gap-[3px] border-b border-border px-6">
            {bars.map((i) => {
              const t = i / bars.length;
              const center = 1 - Math.abs(t - 0.5) * 2;
              const h = isRecording
                ? 6 + recorder.level * 90 * (0.4 + center * 0.9) * (0.6 + Math.random() * 0.6)
                : 4 + center * 14;
              return (
                <motion.div
                  key={i}
                  animate={{ height: h }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  className={`w-[3px] rounded-full ${isRecording ? "bg-signal" : "bg-muted-foreground/40"}`}
                />
              );
            })}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleToggle}
                disabled={busy}
                className={`group relative flex h-12 items-center gap-3 rounded-lg border px-5 font-mono text-sm transition-all disabled:opacity-50 ${
                  isRecording
                    ? "border-signal/50 bg-signal text-signal-foreground hover:bg-signal/90"
                    : "border-border bg-foreground text-primary-foreground hover:bg-foreground/90"
                }`}
              >
                <span className={`h-2 w-2 rounded-sm ${isRecording ? "bg-signal-foreground" : "bg-signal"}`} />
                {busy ? "transcribing…" : isRecording ? "stop" : "record"}
              </button>
              <div className="font-mono text-xs tabular-nums text-muted-foreground">
                {isRecording ? formatTime(recorder.elapsed) : "00:00"}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <input
                  type="checkbox"
                  checked={autoCopy}
                  onChange={(e) => setAutoCopy(e.target.checked)}
                  className="h-3 w-3 accent-signal"
                />
                auto-copy
              </label>
              <kbd className="hidden rounded border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
                space
              </kbd>
            </div>
          </div>

          {/* Model selector */}
          <div className="flex gap-1 border-t border-border p-2">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModelId(m.id)}
                disabled={busy || isRecording}
                className={`flex-1 rounded-md px-3 py-2 text-left font-mono text-xs transition-colors disabled:opacity-50 ${
                  modelId === m.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{m.label}</span>
                  <span className="text-[10px] uppercase tracking-wider opacity-60">{m.note}</span>
                </div>
                <div className="mt-0.5 text-[10px] opacity-60">{m.size}</div>
              </button>
            ))}
          </div>

          {/* Load progress */}
          <AnimatePresence>
            {busy && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden border-t border-border"
              >
                <div className="flex items-center justify-between px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span>{loadStatus}</span>
                  <span>{loadPct}%</span>
                </div>
                <div className="h-px bg-border">
                  <motion.div
                    className="h-full bg-signal"
                    animate={{ width: `${loadPct}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {recorder.error && (
            <div className="border-t border-border px-4 py-2 font-mono text-xs text-destructive">
              {recorder.error}
            </div>
          )}
        </div>

        {/* Transcript */}
        <AnimatePresence>
          {transcript && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-6 rounded-xl border border-border bg-surface/60 p-5 backdrop-blur-sm"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  transcript
                </div>
                <button
                  onClick={() => copy(transcript)}
                  className="rounded-md border border-border bg-background px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {copied ? "copied" : "copy"}
                </button>
              </div>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                {transcript}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History */}
        {history.length > 0 && (
          <section className="mt-12">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                history
              </h2>
              <button
                onClick={() => setHistory([])}
                className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                clear
              </button>
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface/40">
              {history.map((h) => (
                <li key={h.id} className="group flex items-start gap-4 px-5 py-4">
                  <div className="mt-1 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <p className="flex-1 text-sm leading-relaxed text-foreground/90">{h.text}</p>
                  <button
                    onClick={() => copy(h.text)}
                    className="shrink-0 rounded-md border border-transparent px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:border-border hover:bg-accent hover:text-accent-foreground"
                  >
                    copy
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer / electron note */}
        <footer className="mt-16 rounded-xl border border-dashed border-border/70 p-5">
          <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            coming in desktop build
          </div>
          <p className="text-sm text-muted-foreground">
            Global hotkey from anywhere, auto-paste into the focused app, and bigger
            whisper models running natively via whisper.cpp.
          </p>
        </footer>
      </main>
    </div>
  );
}
