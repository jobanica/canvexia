"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A loud, looping incoming-order alarm for the merchant tablet.
 *
 * Browser autoplay rules forbid sound until the user has interacted with the
 * page, so the flow is: the screen shows a "Tap to enable sound" gate → that tap
 * calls unlock() (which resumes the AudioContext) → afterwards start() can ring
 * at any time. The alarm keeps beeping + vibrating until stop() is called
 * (i.e. staff taps Accept or Reject).
 *
 * The sound is synthesised with the Web Audio API (no audio file to ship, and a
 * pure tone cuts through a noisy kitchen). KNOWN LIMITATION: this only rings
 * reliably while the PWA is open and the tablet is awake — hence the wake-lock
 * and the always-on, plugged-in tablet. We do not promise locked/backgrounded
 * ringing for a PWA.
 */
const STORAGE_KEY = "servd_alarm_started";

export function useOrderAlarm() {
  const [unlocked, setUnlocked] = useState(false);
  // Whether the AudioContext is actually running right now (i.e. sound will
  // play). It goes false when the OS suspends the context in the background,
  // and after an app kill + reload (audio needs a fresh gesture to resume).
  const [soundOn, setSoundOn] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringingRef = useRef(false);

  // Restore the "started" intent from a prior session so an app kill / reload
  // doesn't dump staff back on the big black start screen — they land on the
  // board and re-enable sound with a single tap (see soundOn banner).
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setUnlocked(true);
    } catch {
      /* storage blocked (private mode) — the gate just shows normally */
    }
  }, []);

  const getCtx = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    try {
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
      return ctxRef.current;
    } catch {
      return null;
    }
  }, []);

  /** Call from a user gesture (the "Enable sound" tap) to satisfy autoplay rules. */
  const unlock = useCallback(async () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    const ctx = getCtx();
    if (!ctx) {
      // No Web Audio support — proceed vibration-only, and don't nag with the
      // "sound is off" banner since there's nothing more to enable.
      setUnlocked(true);
      setSoundOn(true);
      return;
    }
    try {
      await ctx.resume();
      // Play an inaudible blip so the context is firmly "running".
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.05);
    } catch {
      /* ignore */
    }
    setUnlocked(true);
    setSoundOn(ctx.state === "running");
  }, [getCtx]);

  /**
   * Resume a context the OS suspended while the app was backgrounded. Safe to
   * call on foreground WITHOUT a fresh gesture for a context that ran earlier in
   * this page; on a brand-new page load it may stay suspended until the next tap
   * (that's what the soundOn banner + first-tap re-arm are for).
   */
  const resume = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
    setSoundOn(ctx.state === "running");
  }, []);

  /** One two-tone beep + a vibration pulse. */
  const beep = useCallback(() => {
    const ctx = getCtx();
    // If the OS suspended us in the background, try to wake the context so the
    // following beeps in the loop actually sound.
    if (ctx && ctx.state === "suspended") {
      ctx.resume().then(() => setSoundOn(ctx.state === "running")).catch(() => {});
    }
    if (ctx && ctx.state === "running") {
      const now = ctx.currentTime;
      const tones = [880, 1320];
      tones.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "square";
        o.frequency.value = freq;
        const t0 = now + i * 0.22;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        o.connect(g).connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + 0.21);
      });
    }
    try {
      navigator.vibrate?.([300, 120, 300]);
    } catch {
      /* ignore */
    }
  }, [getCtx]);

  const start = useCallback(() => {
    if (ringingRef.current) return;
    ringingRef.current = true;
    beep();
    loopRef.current = setInterval(beep, 1400);
  }, [beep]);

  const stop = useCallback(() => {
    ringingRef.current = false;
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
    try {
      navigator.vibrate?.(0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { unlocked, soundOn, unlock, resume, start, stop };
}
