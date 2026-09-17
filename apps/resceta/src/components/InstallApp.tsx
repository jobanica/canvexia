"use client";

import { useEffect, useState } from "react";

/**
 * "Install Resceta" — the button, and the iOS instructions that stand in for
 * one.
 *
 * WHY A MANIFEST IS NOT ENOUGH. A manifest plus a service worker makes a page
 * installable; it does not make anyone install it. Chrome buries its own prompt
 * behind a ⋮ most people never open, and iOS Safari has no prompt at all —
 * Share → Add to Home Screen, three taps deep, with nothing on the page ever
 * mentioning it. A pharmacy told "install the app" and left to find it will
 * conclude there isn't one.
 *
 * So on Android and desktop Chromium this holds the browser's own
 * `beforeinstallprompt` and fires it from a button somebody can see. On iOS it
 * cannot, so it says the three taps out loud rather than pretending a button
 * will work.
 *
 * IT RENDERS NOTHING when there is nothing to offer — already installed, an
 * unsupported browser, or dismissed once. An install banner that survives being
 * installed is the most annoying thing a web app does.
 */

/** The non-standard Chromium event. Not in lib.dom, hence the hand-written type. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const STORAGE_KEY = "resceta-install-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // Safari's own non-standard answer.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac. Touch points is what gives it away —
  // and a tablet propped beside a till is exactly the device this is for.
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  // Chrome and Firefox on iOS cannot add to the home screen at all, so telling
  // their users to tap Share sends them somewhere with no such option.
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function InstallApp({ className = "" }: { className?: string }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "no") return;
    } catch {
      /* private mode, or storage off. Showing it is the safe side. */
    }
    setHidden(false);
    setIos(isIosSafari());

    const onPrompt = (e: Event) => {
      // Without this Chrome shows its own mini-infobar and the event is lost.
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(STORAGE_KEY, "no");
    } catch {
      /* it comes back next visit, which beats crashing */
    }
  };

  // Nothing to offer: not installable here, or already dealt with.
  if (hidden || (!prompt && !ios)) return null;

  return (
    <div className={`rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm ${className}`}>
      <p className="font-semibold text-white">Install Resceta</p>
      <p className="mt-0.5 text-slate-300">
        Opens from the home screen without the browser bar, and keeps working long enough to read
        a screen when the signal drops.
      </p>

      {prompt ? (
        <button
          type="button"
          onClick={async () => {
            // A prompt can be fired once. Whatever they choose it is spent, so
            // clear it either way rather than leaving a dead button.
            const p = prompt;
            setPrompt(null);
            try {
              await p.prompt();
              const { outcome } = await p.userChoice;
              if (outcome === "accepted") setHidden(true);
            } catch {
              setHidden(true);
            }
          }}
          className="mt-3 rounded-lg brand-gradient px-4 py-2 text-sm font-medium text-white"
        >
          Install
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setShowSteps((v) => !v)}
            className="mt-3 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-200"
          >
            {showSteps ? "Hide steps" : "How"}
          </button>
          {showSteps && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-slate-300">
              <li>
                Tap <span className="font-semibold">Share</span> — the square with an arrow, at
                the bottom of Safari.
              </li>
              <li>
                Scroll down and tap <span className="font-semibold">Add to Home Screen</span>.
              </li>
              <li>
                Tap <span className="font-semibold">Add</span>.
              </li>
            </ol>
          )}
        </>
      )}

      <button
        type="button"
        onClick={dismiss}
        className="mt-2 block text-xs text-slate-500 underline"
      >
        Not now
      </button>
    </div>
  );
}
