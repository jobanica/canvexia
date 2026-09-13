"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Explicit "Install" affordance for the merchant tablet, so staff don't have to
 * hunt through Chrome's ⋮ menu. On Android Chrome it captures the
 * beforeinstallprompt event and triggers the native install dialog. On iOS
 * (which has no such event) it shows the manual Share → "Add to Home Screen"
 * steps. Hides itself once the app is running standalone (already installed).
 */
export function InstallButton({ subtle = false }: { subtle?: boolean }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    // Already installed / launched from the home screen → nothing to do.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIos = /iphone|ipad|ipod/i.test(ua);
  // iOS can only "install" a PWA from Safari — Chrome/Edge/Firefox on iOS (CriOS/
  // FxiOS/EdgiOS) can't add a working home-screen app.
  const iosNotSafari = isIos && /crios|fxios|edgios|opt\//i.test(ua);

  async function onClick() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice.catch(() => {});
      setDeferred(null);
      return;
    }
    // No native prompt available (iOS, or criteria not yet met) → show steps.
    setShowIosHelp(true);
  }

  const cls = subtle
    ? "rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white"
    : "rounded-full border border-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary";

  return (
    <>
      <button onClick={onClick} className={cls}>
        📲 Install app
      </button>

      {showIosHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setShowIosHelp(false)}>
          <div className="max-w-sm rounded-2xl bg-white p-6 text-center text-plum-ink" onClick={(e) => e.stopPropagation()}>
            <p className="font-heading text-lg font-bold">Add to your home screen</p>
            {iosNotSafari ? (
              <p className="mt-2 text-sm text-plum-ink/70">
                On iPhone/iPad you must use <strong>Safari</strong> to install the app.
                Open this same link in <strong>Safari</strong>, tap the <strong>Share</strong>{" "}
                <span aria-hidden>⬆️</span> button, then <strong>“Add to Home Screen.”</strong>
              </p>
            ) : isIos ? (
              <p className="mt-2 text-sm text-plum-ink/70">
                In <strong>Safari</strong>, tap the <strong>Share</strong> button{" "}
                <span aria-hidden>⬆️</span>, then choose <strong>“Add to Home Screen.”</strong> Open the
                app from that icon to run full-screen — and to get order notifications, allow them the
                first time you open it (needs iOS 16.4+).
              </p>
            ) : (
              <p className="mt-2 text-sm text-plum-ink/70">
                Open this page in <strong>Chrome</strong>, tap the <strong>⋮</strong> menu, then{" "}
                <strong>“Install app”</strong> / <strong>“Add to Home screen.”</strong> If you don&apos;t
                see it yet, reload the page once and try again.
              </p>
            )}
            <button onClick={() => setShowIosHelp(false)} className="mt-4 rounded-full px-5 py-2 text-sm font-semibold btn-brand">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
