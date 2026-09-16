"use client";

import { useEffect, useState } from "react";

/**
 * "Install this app" — the button, and the iOS instructions that stand in for
 * one.
 *
 * WHY THIS IS NOT JUST A MANIFEST. A manifest plus a service worker makes a
 * page installable; it does not make anyone install it. Chrome buries its own
 * prompt in an overflow menu behind a ⋮ most people never open, and iOS Safari
 * has no prompt at all — Share → Add to Home Screen, three taps deep, and
 * nothing on the page ever mentions it. A partner told "install our app" and
 * left to find it will conclude there isn't one.
 *
 * So: on Android/desktop Chromium we hold the browser's own
 * `beforeinstallprompt` and fire it from a button that is actually visible. On
 * iOS we cannot, so we say the three taps out loud instead of pretending a
 * button will work.
 *
 * IT RENDERS NOTHING when there is nothing to offer — already installed, an
 * unsupported browser, or dismissed. An install banner that survives being
 * installed is the most annoying thing a web app does.
 */

/** The non-standard Chromium event. Not in lib.dom, hence the hand-written type. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // The Chromium/Android answer, and then Safari's own non-standard one.
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac. Touch points is what gives it away.
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  // Chrome and Firefox on iOS cannot add to the home screen at all, so telling
  // their users to tap Share would be sending them somewhere that has no such
  // option.
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function InstallApp({
  label,
  storageKey,
  className = "",
}: {
  /** What the installed app is called, so the copy names the right thing. */
  label: string;
  /**
   * Per-app, because one deployment offers three: dismissing the HQ console
   * must not also hide the prompt for the field app on the same phone.
   */
  storageKey: string;
  className?: string;
}) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(storageKey) === "no") return;
    } catch {
      /* private mode, or storage off. Showing it is the safe side. */
    }
    setHidden(false);
    setIos(isIosSafari());

    const onPrompt = (e: Event) => {
      // Without this Chrome shows its own mini-infobar and we lose the event.
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
  }, [storageKey]);

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(storageKey, "no");
    } catch {
      /* it just comes back next visit, which is a fair trade for not crashing */
    }
  };

  // Nothing to offer: not installable here, or already dealt with.
  if (hidden || (!prompt && !ios)) return null;

  return (
    <div
      className={`rounded-xl border border-brand-ink/10 bg-brand-surface px-3 py-2.5 text-xs ${className}`}
    >
      <p className="font-semibold text-brand-ink">Install {label}</p>
      <p className="mt-0.5 leading-snug text-brand-ink/55">
        Opens from your home screen, without the browser bar.
      </p>

      {prompt ? (
        <button
          type="button"
          onClick={async () => {
            // A prompt can only be fired once. Whatever they choose, it is
            // spent — so clear it either way rather than leaving a dead button.
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
          className="mt-2 w-full rounded-full bg-brand-primary px-3 py-1.5 font-semibold text-white"
        >
          Install
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setShowIosHelp((v) => !v)}
            className="mt-2 w-full rounded-full border border-brand-ink/15 px-3 py-1.5 font-semibold text-brand-ink/70"
          >
            {showIosHelp ? "Hide steps" : "How"}
          </button>
          {showIosHelp && (
            <ol className="mt-2 list-decimal space-y-1 pl-4 leading-snug text-brand-ink/60">
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
        className="mt-1.5 w-full py-1 text-[0.65rem] text-brand-ink/40 hover:text-brand-ink/70"
      >
        No thanks
      </button>
    </div>
  );
}
