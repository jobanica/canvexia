/**
 * Attention beeps using the Web Audio API — no audio asset needed. Used to
 * alert the kitchen and cashier (incoming order / online payment) and the diner
 * (order ready).
 *
 * THE BUG THIS FIXES: the kitchen display was silent on every tablet tested.
 * The old version built a fresh AudioContext for each beep, and a context
 * created outside a user gesture starts `suspended` on mobile Chrome and Safari
 * and never plays. Tapping the sound toggle appeared to work — that beep was
 * inside a gesture — but every alert afterwards built another suspended context
 * and made no noise. A kitchen has nobody watching the screen; a chime that
 * only sounds when someone touches it is no alert at all.
 *
 * So there is ONE context for the page, unlocked once by any tap and resumed
 * whenever the browser has parked it (which it does when a tablet sleeps or the
 * tab goes to the background — the exact conditions a kitchen screen lives in).
 * `audioBlocked()` lets the UI say so plainly instead of failing silently.
 */

type Ctor = typeof AudioContext;

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  try {
    const Ctor: Ctor | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Let the page make sound. MUST be called from inside a user gesture — a tap,
 * click or keypress — because that is the only moment a browser will allow it.
 *
 * Safe to call repeatedly; after the first success it's just a resume.
 */
export function unlockAudio(): void {
  const c = context();
  if (!c) return;
  try {
    void c.resume();
    // A zero-length silent buffer. Some iOS versions won't consider a context
    // truly unlocked until something has actually been played through it.
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* nothing to do — audioBlocked() will report it */
  }
}

/** True when the browser is still refusing to play sound without a gesture. */
export function audioBlocked(): boolean {
  const c = context();
  return c != null && c.state !== "running";
}

export function beep(durationMs = 220, frequency = 880): void {
  const c = context();
  if (!c) return;
  try {
    // Tablets suspend the context when they sleep or the tab is backgrounded.
    // Resuming is allowed once the context has been unlocked by a gesture, so
    // this is what keeps a screen that's been sitting idle all service audible.
    if (c.state !== "running") void c.resume();

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, c.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + durationMs / 1000 + 0.02);
    // The context is shared and reused, so only the nodes are disposed here.
    // Closing it would silence every later alert — which is the original bug.
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* already gone */
      }
    };
  } catch {
    /* sound is a nicety, never required */
  }
}

/** Two quick beeps — a more noticeable "new thing happened" chime. */
export function chime(): void {
  beep(180, 880);
  setTimeout(() => beep(220, 1175), 200);
}

/**
 * A chime loud and long enough to carry across a kitchen: three rising pairs.
 * The single chime is fine for a cashier looking at the screen; the kitchen is
 * across the room with extractor fans running.
 */
export function alertChime(): void {
  chime();
  setTimeout(chime, 700);
  setTimeout(chime, 1400);
}
