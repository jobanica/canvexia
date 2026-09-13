"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getDeliveryOrders, markOutForDelivery, markDelivered, type DeliveryOrder } from "@/server/orders/delivery";
import { acceptOrder } from "@/server/orders/cashier";
import { formatPeso } from "@/lib/money";
import { MiniMap } from "./MiniMap";
import { DeliveryRiderPanel } from "@/components/delivery/DeliveryRiderPanel";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold"
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

export function DeliveryBoard({
  restaurantId,
  initial,
}: {
  restaurantId: string;
  initial: DeliveryOrder[];
}) {
  const [orders, setOrders] = useState<DeliveryOrder[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [pulse, setPulse] = useState(0); // bumped on refresh → rider panels re-fetch

  const refresh = useCallback(async () => {
    try {
      setOrders(await getDeliveryOrders());
      setPulse((p) => p + 1);
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on("broadcast", { event: "refresh" }, () => refresh())
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    const poll = setInterval(refresh, 15000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, refresh]);

  async function accept(id: string) {
    setBusy(id);
    await acceptOrder(id);
    setBusy(null);
    refresh();
  }
  async function dispatch(id: string) {
    setBusy(id);
    const res = await markOutForDelivery(id);
    setBusy(null);
    if (res.ok && res.orders) setOrders(res.orders);
    else if (res.error) alert(res.error);
  }
  async function deliver(id: string) {
    setBusy(id);
    const res = await markDelivered(id);
    setBusy(null);
    if (res.ok && res.orders) setOrders(res.orders);
    else if (res.error) alert(res.error);
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs text-plum-ink/50">
        <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-mango" : "bg-muted"}`} />
        {live ? "Live" : "Polling"}
        <span className="ml-2">{orders.length} active delivery order{orders.length === 1 ? "" : "s"}</span>
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-plum-ink/40">No delivery orders right now.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {orders.map((o) => {
            const coords = o.lat != null && o.lng != null ? `${o.lat},${o.lng}` : null;
            return (
              <section key={o.id} className="rounded-tile border border-plum-ink/10 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-heading text-lg font-extrabold">🛵 {o.customerName ?? "Customer"}</h2>
                    <p className="text-sm text-plum-ink/60">{o.customerPhone ?? "—"}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold">{formatPeso(o.total)}</span>
                    <p className="text-xs text-plum-ink/45">
                      {o.deliveryStatus === "out_for_delivery" ? (
                        <span className="font-semibold text-brand-primary">🛵 Out for delivery</span>
                      ) : (
                        <>{o.status} · {o.paymentStatus}</>
                      )}
                    </p>
                  </div>
                </div>

                {o.customerAddress && <p className="mt-2 text-sm text-plum-ink/70">📍 {o.customerAddress}</p>}

                <p className="mt-2 text-xs text-plum-ink/55">
                  {o.items.map((it) => `${it.quantity}× ${it.name}`).join(", ")}
                </p>

                {coords ? (
                  <div className="mt-3">
                    <MiniMap lat={o.lat!} lng={o.lng!} />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <CopyButton text={coords} label="Copy coordinates" />
                      <a href={`https://maps.google.com/?q=${coords}`} target="_blank" rel="noopener" className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">Google Maps</a>
                      <a href={`https://waze.com/ul?ll=${coords}&navigate=yes`} target="_blank" rel="noopener" className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">Waze</a>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/50">No map pin — use the address above.</p>
                )}

                {/* Status flow */}
                {o.deliveryStatus === "out_for_delivery" ? (
                  <button
                    onClick={() => deliver(o.id)}
                    disabled={busy === o.id}
                    className="mt-3 w-full rounded-full bg-green-600 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    ✓ Mark delivered (paid on delivery)
                  </button>
                ) : o.status === "pending" ? (
                  <button
                    onClick={() => accept(o.id)}
                    disabled={busy === o.id}
                    className="mt-3 w-full rounded-full py-2 text-sm font-semibold btn-brand disabled:opacity-60"
                  >
                    Accept order
                  </button>
                ) : o.status === "done" ? (
                  <button
                    onClick={() => dispatch(o.id)}
                    disabled={busy === o.id}
                    className="mt-3 w-full rounded-full bg-brand-primary py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    🛵 Out for delivery
                  </button>
                ) : (
                  <p className="mt-3 text-center text-xs text-plum-ink/40">Preparing — waiting for the kitchen to finish.</p>
                )}

                {/* Third-party rider booking */}
                <DeliveryRiderPanel orderId={o.id} pulse={pulse} />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
