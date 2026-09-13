/**
 * Subscribing a browser to Web Push, once, from a tap.
 *
 * Pulled out of MerchantBoard because a diner now needs the same three steps —
 * permission, a subscription against the VAPID key, hand it to the server —
 * and the only thing that differs between them is where it gets stored.
 *
 * Everything is best-effort. A browser without push, a deployment without VAPID
 * keys, a person who says no: all of them return false and the page carries on
 * updating itself the way it always did.
 */

/** VAPID key (URL-safe base64) → Uint8Array for pushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

/**
 * Ask, subscribe, and hand back the keys for whoever wants to store them.
 *
 * Must be called from a real gesture: browsers refuse the permission prompt
 * outside one, and refuse it silently.
 */
export async function subscribeToPush(vapidPublicKey?: string): Promise<PushKeys | null> {
  const vapid = vapidPublicKey ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid || !pushSupported()) return null;
  try {
    if (Notification.permission === "denied") return null;
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return null;
    }
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      }));
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
    return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
  } catch {
    return null;
  }
}
