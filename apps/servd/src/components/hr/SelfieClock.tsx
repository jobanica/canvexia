"use client";

import { useEffect, useRef, useState } from "react";
import { clockSelfie, type ClockStatus } from "@/server/hr/clock-self";

function sinceLabel(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function SelfieClock({ initial }: { initial: ClockStatus }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState(initial);
  const [camOn, setCamOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }
  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    setError(null);
    setDone(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamOn(true);
    } catch {
      setError("Camera access is required to clock in. Please allow the camera and try again.");
    }
  }

  async function capture() {
    const v = videoRef.current;
    if (!v || !streamRef.current) {
      setError("Start the camera first.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 640;
    canvas.height = v.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);

    setBusy(true);
    setError(null);
    const res = await clockSelfie(dataUrl);
    setBusy(false);
    if (res.ok) {
      stopCamera();
      setStatus({ name: res.name ?? status.name, clockedIn: res.status === "in", since: res.status === "in" ? new Date().toISOString() : null });
      setDone(res.status === "in" ? "Clocked in ✓" : "Clocked out ✓");
    } else {
      setError(res.error ?? "Something went wrong.");
    }
  }

  return (
    <div className="mx-auto max-w-sm rounded-tile border border-plum-ink/10 bg-white p-5 text-center">
      <p className="font-heading text-lg font-bold">{status.name}</p>
      <p className="mt-1 text-sm text-plum-ink/55">
        {status.clockedIn ? `On the clock · ${sinceLabel(status.since)}` : "Not clocked in"}
      </p>

      <div className="my-4 aspect-[3/4] overflow-hidden rounded-tile bg-plum-ink/90">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${camOn ? "" : "hidden"}`} />
        {!camOn && (
          <div className="flex h-full items-center justify-center text-cream/60 text-sm">
            Camera off
          </div>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-guava">{error}</p>}
      {done && <p className="mb-3 text-sm font-semibold text-mango">{done}</p>}

      {!camOn ? (
        <button onClick={startCamera} className="w-full rounded-full py-3 font-semibold btn-brand">
          Start camera
        </button>
      ) : (
        <button
          onClick={capture}
          disabled={busy}
          className="w-full rounded-full py-3 font-semibold btn-brand disabled:opacity-60"
        >
          {busy ? "Saving…" : status.clockedIn ? "Take photo & clock out" : "Take photo & clock in"}
        </button>
      )}
    </div>
  );
}
