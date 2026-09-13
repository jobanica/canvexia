"use client";

import Script from "next/script";
import { useEffect } from "react";

/**
 * Meta Pixel + our own landing-view counter.
 *
 * Config-gated on NEXT_PUBLIC_META_PIXEL_ID: with no id set, nothing loads and
 * no third-party script touches the page at all. Loaded `afterInteractive` so
 * it can never sit in front of the hero paint — the whole point of the pixel is
 * to buy better traffic, and it shouldn't cost us the traffic we already have.
 *
 * The event to optimize toward is Purchase (fired on activation), not
 * PageView — Facebook will happily find you a thousand people who look at a
 * page and never pay.
 */
export function Pixel({ pixelId }: { pixelId?: string }) {
  if (!pixelId) return null;
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');fbq('track','PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}

/**
 * The event the ad account should actually be optimizing toward: a restaurant
 * that paid. Fired once, when the success page observes the activation.
 *
 * It's reported from the browser rather than the webhook because that's where
 * the pixel's identity lives; the webhook remains the only thing that decides
 * whether an activation happened at all.
 */
export function trackPurchase(pesos: number): void {
  try {
    window.fbq?.("track", "Purchase", { value: pesos, currency: "PHP" });
  } catch {
    /* pixel absent or blocked */
  }
}

/**
 * Our own view counter, so the funnel is measurable whether or not the pixel is
 * configured — and so the numbers the founder makes decisions on live in a
 * database they own rather than in an ad account.
 */
export function LandingView() {
  useEffect(() => {
    const body = JSON.stringify({ event: "view" });
    void fetch("/api/landing-event", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  }, []);
  return null;
}
