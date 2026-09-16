"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The kiosk screen: a QR code that rotates every minute, and a lock.
 *
 * THE CODE COMES FROM THE SERVER, always. This component never sees the kiosk's
 * secret — a tablet left on a counter is the least trustworthy device in the
 * whole system, and a secret in its JavaScript is a secret anybody can lift
 * with the browser's own developer tools.
 *
 * It polls, rather than counting down locally, for the same reason: a tablet
 * whose clock has drifted would otherwise draw a code the server will refuse,
 * and the person standing in front of it would have no idea why.
 */
export function KioskDisplay({
  kioskId,
  label,
  partnerName,
}: {
  kioskId: string;
  label: string;
  partnerName: string;
}) {
  const [png, setPng] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  const [locked, setLocked] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/partner/kiosk/code?id=${encodeURIComponent(kioskId)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { ok: boolean; code?: string; url?: string };
      if (!json.ok || !json.url) {
        setOff(true);
        setPng(null);
        return;
      }
      setOff(false);
      setCode(json.code ?? null);
      const QRCode = (await import("qrcode")).default;
      setPng(
        await QRCode.toDataURL(json.url, { width: 640, margin: 1, errorCorrectionLevel: "M" }),
      );
    } catch {
      // A dropped poll is not a dead kiosk: the code on screen is still valid
      // for up to two minutes, so leave it and try again on the next tick.
    }
  }, [kioskId]);

  useEffect(() => {
    void refresh();
    // Twenty seconds, not sixty. A code lives for one bucket plus the previous
    // one, so polling at the rotation rate would leave the screen showing an
    // almost-expired code for most of every minute.
    const timer = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(timer);
  }, [refresh]);

  /**
   * Leaving fullscreen locks the screen.
   *
   * The honest version of "requires re-auth to exit". No browser lets a page
   * refuse to be closed or trap fullscreen — so what this does is make the
   * session useless the moment the display stops being a display: the lock
   * covers everything, and clearing it means signing in again.
   */
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setLocked(true);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const goFullscreen = async () => {
    try {
      await shellRef.current?.requestFullscreen();
      setLocked(false);
    } catch {
      /* a browser that refuses fullscreen still shows the code */
    }
  };

  return (
    <div ref={shellRef} className="relative flex min-h-screen flex-col items-center justify-center bg-brand-ink px-6 py-10 text-white">
      <p className="text-sm uppercase tracking-[0.2em] text-white/45">{partnerName}</p>
      <h1 className="mt-1 font-heading text-3xl font-bold">{label}</h1>

      {off ? (
        <p className="mt-12 max-w-sm text-center text-lg text-white/70">
          This kiosk is switched off. A manager can turn it back on from the attendance
          screen.
        </p>
      ) : (
        <>
          <div className="mt-8 rounded-3xl bg-white p-6">
            {png ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={png} alt="" width={320} height={320} className="h-[320px] w-[320px]" />
            ) : (
              <div className="h-[320px] w-[320px] animate-pulse rounded-xl bg-brand-ink/10" />
            )}
          </div>
          <p className="mt-6 text-center text-lg text-white/70">
            Open CANVEXIA on your phone and tap <strong className="text-white">Scan</strong>,
            or point your camera here.
          </p>
          {code && (
            // The code in plain text as well, for a phone whose camera will not
            // focus and for somebody reading it out over a counter.
            <p className="mt-2 font-mono text-2xl tracking-[0.3em] text-white/85">{code}</p>
          )}
          <p className="mt-1 text-sm text-white/40">The code changes every minute.</p>
        </>
      )}

      <button
        onClick={() => void goFullscreen()}
        className="mt-10 rounded-full border border-white/25 px-5 py-2 text-sm font-semibold text-white/70"
      >
        Fullscreen
      </button>

      {locked && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-brand-ink/95 px-6 text-center">
          <p className="font-heading text-2xl font-bold">Kiosk locked</p>
          <p className="max-w-sm text-sm text-white/60">
            The display left fullscreen. Sign in again to use this tablet for anything
            else, or put it back into fullscreen to keep showing the code.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => void goFullscreen()}
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-brand-ink"
            >
              Back to fullscreen
            </button>
            <a
              href="/partner/login"
              className="rounded-full border border-white/25 px-5 py-2 text-sm font-semibold text-white/75"
            >
              Sign in
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
