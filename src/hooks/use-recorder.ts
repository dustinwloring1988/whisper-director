import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "recording" | "stopped";

export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const rafId = useRef<number | null>(null);
  const startTime = useRef<number>(0);
  const resolveStop = useRef<((blob: Blob) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      stream.current = s;
      const mr = new MediaRecorder(s);
      mediaRecorder.current = mr;
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
        resolveStop.current?.(blob);
        resolveStop.current = null;
      };
      mr.start();
      startTime.current = performance.now();
      setState("recording");

      // VU meter
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const src = ctx.createMediaStreamSource(s);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 2.5));
        setElapsed((performance.now() - startTime.current) / 1000);
        rafId.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e: any) {
      setError(e?.message || "Microphone unavailable");
      setState("idle");
    }
  }, []);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const mr = mediaRecorder.current;
    if (!mr || mr.state === "inactive") return null;
    const blob = await new Promise<Blob>((resolve) => {
      resolveStop.current = resolve;
      mr.stop();
    });
    cleanup();
    setState("stopped");
    return blob;
  }, [cleanup]);

  return { state, level, elapsed, error, start, stop };
}
