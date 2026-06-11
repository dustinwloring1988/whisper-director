// Browser-only Whisper transcription via @huggingface/transformers.
// Loaded lazily — model weights are big.

let transcriberPromise: Promise<any> | null = null;
let currentModel = "";

export type ProgressCb = (msg: { status: string; progress?: number; file?: string }) => void;

export async function getTranscriber(model: string, onProgress?: ProgressCb) {
  if (transcriberPromise && currentModel === model) return transcriberPromise;
  currentModel = model;
  transcriberPromise = (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    return pipeline("automatic-speech-recognition", model, {
      progress_callback: onProgress,
      // dtype/device fallback: WebGPU if available, otherwise wasm
      device: (navigator as any).gpu ? "webgpu" : "wasm",
      dtype: (navigator as any).gpu ? "fp32" : "q8",
    } as any);
  })();
  return transcriberPromise;
}

/** Decode a recorded Blob into a mono Float32Array @ 16kHz for Whisper. */
export async function blobToMono16k(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx({ sampleRate: 16000 });
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    ctx.close();
  }
  // Mix down to mono
  const ch0 = decoded.getChannelData(0);
  if (decoded.numberOfChannels === 1 && decoded.sampleRate === 16000) {
    return new Float32Array(ch0);
  }
  // Offline resample to 16kHz mono
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return new Float32Array(rendered.getChannelData(0));
}

export async function transcribe(
  blob: Blob,
  model: string,
  onProgress?: ProgressCb,
): Promise<string> {
  const transcriber = await getTranscriber(model, onProgress);
  const audio = await blobToMono16k(blob);
  const output = await transcriber(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
  });
  const text = Array.isArray(output) ? output.map((o: any) => o.text).join(" ") : output.text;
  return (text ?? "").trim();
}
