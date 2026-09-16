"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Read a QR code from the camera.
 *
 * TWO DECODERS, in this order:
 *
 *   1. the browser's own `BarcodeDetector`, which costs zero bytes and is what
 *      Chrome on Android — the phone field staff actually carry — has had for
 *      years;
 *   2. `jsqr` (~14 kB, no dependencies), imported ONLY when the first is
 *      missing, which is mainly iOS Safari before 17.
 *
 * The fallback is a dynamic import for that reason: the common case downloads
 * nothing, and the phone that needs it pays for it once.
 *
 * THE CAMERA IS OPENED ON A TAP AND CLOSED ON EVERY EXIT PATH. A page that
 * holds a camera stream open after the panel is dismissed leaves the recording
 * light on, which is the single fastest way to make somebody uninstall this.
 */
export function QrScanner({
  onResult,
  onClose,
}: {
  onResult: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    const stop = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // The BACK camera. `environment` is a hint, not a guarantee, but on a
          // phone held up to a screen the front camera is never what is wanted.
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) return stop();
        const video = videoRef.current;
        if (!video) return stop();
        video.srcObject = stream;
        await video.play();

        const detector =
          "BarcodeDetector" in window
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              new (window as any).BarcodeDetector({ formats: ["qr_code"] })
            : null;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        let jsQR: typeof import("jsqr").default | null = null;
        if (!detector) {
          jsQR = (await import("jsqr")).default;
        }

        const tick = async () => {
          if (stopped || !video.videoWidth) {
            if (!stopped) raf = requestAnimationFrame(() => void tick());
            return;
          }
          try {
            if (detector) {
              const found = await detector.detect(video);
              if (found[0]?.rawValue) {
                stop();
                onResult(found[0].rawValue as string);
                return;
              }
            } else if (jsQR && ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const found = jsQR(data.data, data.width, data.height);
              if (found?.data) {
                stop();
                onResult(found.data);
                return;
              }
            }
          } catch {
            /* one bad frame is not a failure; the next one usually reads */
          }
          if (!stopped) raf = requestAnimationFrame(() => void tick());
        };
        raf = requestAnimationFrame(() => void tick());
      } catch {
        setError(
          "We can't open the camera. Allow camera access, or type the code from the screen.",
        );
      }
    })();

    return stop;
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-semibold">Point at the kiosk screen</span>
        <button onClick={onClose} className="min-h-[44px] px-3 text-sm font-semibold">
          Cancel
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {/* A frame to aim with. Purely a target — nothing is cropped to it. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-56 w-56 rounded-2xl border-2 border-white/80" />
        </div>
      </div>
      {error && <p className="bg-black px-4 py-3 text-sm text-white">{error}</p>}
    </div>
  );
}
