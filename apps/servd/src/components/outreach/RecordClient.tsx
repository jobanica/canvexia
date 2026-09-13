"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { issueUploadUrl, finishRecording } from "@/server/outreach/record";
import { outreachScript, MAX_INTRO_SECONDS } from "@/lib/outreach/script";

type Phase = "idle" | "recording" | "recorded" | "uploading" | "done" | "error";

/** Pick a MediaRecorder mime type the device supports (iOS→mp4, Android→webm). */
function pickMime(): string | undefined {
  const candidates = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidates.find((c) => MediaRecorder.isTypeSupported(c));
}

export function RecordClient({ token, clientName }: { token: string; clientName: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const liveRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get the camera as soon as the page loads.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (liveRef.current) {
          liveRef.current.srcObject = stream;
          liveRef.current.play().catch(() => {});
        }
      } catch {
        setError("Camera/microphone access is needed. Allow it in your browser and reload.");
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const stop = useCallback(() => {
    recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  function start() {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mimeType = pickMime();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = rec;
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const type = rec.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      blobRef.current = blob;
      if (playbackRef.current) {
        playbackRef.current.srcObject = null;
        playbackRef.current.src = URL.createObjectURL(blob);
      }
      setPhase("recorded");
    };
    rec.start();
    setSeconds(0);
    setPhase("recording");
    tickRef.current = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_INTRO_SECONDS) stop();
        return next;
      });
    }, 1000);
  }

  function reRecord() {
    blobRef.current = null;
    setSeconds(0);
    setPhase("idle");
    // Re-attach the live preview.
    if (liveRef.current && streamRef.current) {
      liveRef.current.srcObject = streamRef.current;
      liveRef.current.play().catch(() => {});
    }
  }

  async function useRecording() {
    const blob = blobRef.current;
    if (!blob) return;
    setPhase("uploading");
    setError(null);
    try {
      const ticket = await issueUploadUrl(token);
      if (!ticket.ok || !ticket.path || !ticket.token) {
        setError(ticket.error ?? "This link expired. Ask for a new QR code.");
        setPhase("error");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage
        .from(ticket.bucket!)
        .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: blob.type });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        setPhase("error");
        return;
      }
      const fin = await finishRecording(token);
      if (!fin.ok) {
        setError(fin.error ?? "Couldn't finish. Try again.");
        setPhase("error");
        return;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("error");
    }
  }

  if (phase === "done") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-plum-ink px-6 text-center text-white">
        <p className="text-5xl">✅</p>
        <h1 className="font-heading text-2xl font-bold">Sent!</h1>
        <p className="max-w-xs text-sm text-white/70">
          Your recording is uploading &amp; rendering. Head back to the computer — the finished video
          will appear there to download. You can close this page.
        </p>
      </div>
    );
  }

  const recording = phase === "recording";

  return (
    <div className="min-h-screen bg-plum-ink text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col p-4">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Recording for</p>
          <h1 className="font-heading text-xl font-bold">{clientName}</h1>
        </div>

        {/* Teleprompter */}
        <div className="mt-3 rounded-xl bg-white/10 p-3 text-sm leading-relaxed">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">Read this (your own words are fine)</p>
          {outreachScript(clientName)}
        </div>

        {/* Camera / playback */}
        <div className="relative mt-3 flex-1 overflow-hidden rounded-2xl bg-black">
          <video
            ref={liveRef}
            muted
            autoPlay
            playsInline
            className={`h-full w-full object-cover ${phase === "recorded" ? "hidden" : ""}`}
            style={{ transform: "scaleX(-1)" }}
          />
          <video
            ref={playbackRef}
            controls
            playsInline
            className={`h-full w-full object-cover ${phase === "recorded" ? "" : "hidden"}`}
          />
          {recording && (
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> {seconds}s / {MAX_INTRO_SECONDS}s
            </span>
          )}
        </div>

        {error && <p className="mt-2 text-center text-sm text-red-300">{error}</p>}

        {/* Controls */}
        <div className="mt-4 pb-2">
          {phase === "idle" && (
            <button onClick={start} className="w-full rounded-full bg-red-600 py-4 text-lg font-bold">
              ● Record
            </button>
          )}
          {recording && (
            <button onClick={stop} className="w-full rounded-full bg-white py-4 text-lg font-bold text-plum-ink">
              ■ Stop
            </button>
          )}
          {phase === "recorded" && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={reRecord} className="rounded-full border border-white/40 py-4 text-lg font-bold">
                ↻ Re-record
              </button>
              <button onClick={useRecording} className="rounded-full bg-brand-gradient py-4 text-lg font-bold">
                ✓ Use this
              </button>
            </div>
          )}
          {phase === "uploading" && (
            <button disabled className="w-full rounded-full bg-white/20 py-4 text-lg font-bold">
              Uploading…
            </button>
          )}
          {phase === "error" && (
            <button onClick={reRecord} className="w-full rounded-full bg-white py-4 text-lg font-bold text-plum-ink">
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
