"use client";

import { useCallback, useEffect, useState } from "react";
import { getTableBill, requestBill, type TableBill } from "@/server/orders/request-bill";
import { applyBillPromo, clearBillPromo, listRedeemableCodes, type RedeemableCode } from "@/server/promotions/apply-bill";
import { getDineInGcash, type DineInGcash } from "@/server/tables/dine-in-gcash";
import { prepareReceipt } from "@/lib/images/receipt";

function peso(centavos: number) {
  return `₱${(centavos / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

/**
 * The diner's bill, with a choice of how to pay:
 *   • Cash     → flag the cashier (a waiter comes to collect) + "on the way" note.
 *   • GCash QR → the store's own GCash QR, no gateway involved: staff are alerted
 *                and a waiter brings the printed QR to the table (the saved QR
 *                image, if any, also shows on the diner's phone right away).
 *   • Online   → hosted GCash/card checkout (PayMongo / Xendit).
 */
export function BillSheet({
  slug,
  tableToken,
  onClose,
}: {
  slug: string;
  tableToken: string;
  onClose: () => void;
}) {
  const [bill, setBill] = useState<TableBill | null | "loading">("loading");
  const [phase, setPhase] = useState<"choose" | "cash" | "gcash">("choose");
  const [gcash, setGcash] = useState<DineInGcash | null>(null);
  // Proof of payment the diner sends to the cashier from this screen.
  const [gcashRef, setGcashRef] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitMode, setSplitMode] = useState<"evenly" | "item">("evenly");
  const [people, setPeople] = useState(2);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [codes, setCodes] = useState<RedeemableCode[]>([]);

  const loadBill = useCallback(() => {
    return getTableBill({ slug, tableToken })
      .then((r) => setBill(r.ok && r.bill ? r.bill : null))
      .catch(() => setBill(null));
  }, [slug, tableToken]);

  useEffect(() => {
    loadBill();
    listRedeemableCodes({ slug })
      .then(setCodes)
      .catch(() => setCodes([]));
    getDineInGcash({ slug })
      .then((g) => setGcash(g.enabled ? g : null))
      .catch(() => setGcash(null));
  }, [loadBill, slug]);

  async function applyCode(raw?: string) {
    const c = (raw ?? code).trim();
    if (!c) return;
    setPromoBusy(true);
    setPromoError(null);
    const res = await applyBillPromo({ slug, tableToken, code: c });
    if (res.ok) {
      setCode("");
      await loadBill();
    } else {
      setPromoError(res.error);
    }
    setPromoBusy(false);
  }

  async function removeCode() {
    setPromoBusy(true);
    setPromoError(null);
    await clearBillPromo({ slug, tableToken });
    await loadBill();
    setPromoBusy(false);
  }

  async function payCash() {
    setBusy(true);
    setError(null);
    const res = await requestBill({ slug, tableToken, method: "cash" });
    setBusy(false);
    if (res.ok) setPhase("cash");
    else setError(res.error ?? "Couldn't notify the cashier.");
  }

  /**
   * GCash QR: no gateway, no redirect. We just flag the table so staff bring the
   * store's printed QR over, and show the saved QR here meanwhile.
   */
  async function payGcashQr() {
    setBusy(true);
    setError(null);
    const res = await requestBill({ slug, tableToken, method: "gcash_qr" });
    setBusy(false);
    if (res.ok) setPhase("gcash");
    else setError(res.error ?? "Couldn't notify the cashier.");
  }

  async function pickReceipt(file: File | undefined) {
    if (!file) return;
    setReceiptBusy(true);
    setReceiptError(null);
    const { dataUrl, error } = await prepareReceipt(file);
    setReceipt(dataUrl);
    setReceiptError(error);
    setReceiptBusy(false);
  }

  /**
   * Send the reference and screenshot to the cashier.
   *
   * Deliberately not "Paid": the diner is telling staff what they sent, and a
   * person still confirms it against the GCash account. A button here that
   * settled the bill would let anyone close their own tab with a screenshot.
   */
  async function sendProof() {
    setBusy(true);
    setError(null);
    const res = await requestBill({
      slug,
      tableToken,
      method: "gcash_qr",
      reference: gcashRef.trim() || undefined,
      receipt: receipt ?? undefined,
    });
    setBusy(false);
    if (res.ok) setSent(true);
    else setError(res.error ?? "Couldn't send that to the cashier.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-tile bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-brand-ink/15" />

        {phase === "cash" ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-2xl text-white">
              🧑‍🍳
            </div>
            <h2 className="mt-4 font-heading text-xl font-bold text-brand-ink">A waiter is on the way</h2>
            <p className="mt-1 text-sm text-brand-ink/60">
              Someone will come to your table to collect your cash payment. Thank you!
            </p>
            <button onClick={onClose} className="mt-6 w-full rounded-full py-3 font-semibold btn-brand">
              Done
            </button>
          </div>
        ) : phase === "gcash" ? (
          <div className="py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-500 text-2xl text-white">
              📱
            </div>
            <h2 className="mt-4 font-heading text-xl font-bold text-brand-ink">Pay with GCash</h2>
            <p className="mt-1 text-sm text-brand-ink/60">
              A waiter is bringing the GCash QR code to your table.
            </p>

            {gcash?.qrUrl && (
              <>
                <p className="mt-4 text-xs text-brand-ink/50">Or scan it here now:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gcash.qrUrl}
                  alt="GCash QR code"
                  className="mx-auto mt-2 w-56 max-w-full rounded-tile border border-plum-ink/10 object-contain"
                />
              </>
            )}

            {bill !== "loading" && bill !== null && (
              <p className="mt-4 font-heading text-2xl font-extrabold text-brand-ink">{peso(bill.total)}</p>
            )}

            {(gcash?.name || gcash?.number) && (
              <div className="mt-3 rounded-xl bg-cream/60 px-3 py-2 text-sm">
                {gcash.name && <p className="font-semibold text-brand-ink">{gcash.name}</p>}
                {gcash.number && <p className="tracking-wide text-brand-ink/70">{gcash.number}</p>}
              </div>
            )}

            <p className="mt-3 text-xs text-brand-ink/50">
              Send the exact amount, then send your confirmation below so the cashier can close
              your bill without coming back to ask.
            </p>

            {sent ? (
              <p className="mt-4 rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
                Sent to the cashier ✓ They&apos;ll confirm it and close your bill.
              </p>
            ) : (
              <div className="mt-4 text-left">
                <input
                  value={gcashRef}
                  onChange={(e) => setGcashRef(e.target.value)}
                  placeholder="GCash reference no. (optional)"
                  className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                />
                {receipt ? (
                  <div className="mt-2 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={receipt} alt="Your payment screenshot" className="h-14 w-14 rounded-lg border border-plum-ink/10 object-cover" />
                    <span className="text-xs font-semibold text-green-700">Screenshot attached ✓</span>
                    <button type="button" onClick={() => setReceipt(null)} className="text-xs text-brand-ink/50 underline">
                      remove
                    </button>
                  </div>
                ) : (
                  <label className="mt-2 block cursor-pointer rounded-lg border border-dashed border-plum-ink/25 px-3 py-2 text-center text-xs font-semibold text-brand-ink/60">
                    {receiptBusy ? "Processing…" : "📎 Attach your GCash screenshot"}
                    {/* Any image type — an iPhone offers HEIC, and refusing it
                        at the picker is how a diner ends up believing they
                        attached something they didn't. */}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => pickReceipt(e.target.files?.[0])}
                    />
                  </label>
                )}
                {receiptError && (
                  <p className="mt-1 text-[11px] font-semibold text-guava">{receiptError}</p>
                )}
                <button
                  onClick={sendProof}
                  disabled={busy || (!receipt && !gcashRef.trim())}
                  className="mt-3 w-full rounded-full py-3 font-semibold btn-brand disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send to cashier"}
                </button>
              </div>
            )}

            {error && <p className="mt-2 text-sm text-guava">{error}</p>}

            <button onClick={onClose} className="mt-3 w-full rounded-full border border-plum-ink/15 py-3 font-semibold text-brand-ink">
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-heading text-xl font-bold text-brand-ink">Your bill</h2>

            {bill === "loading" ? (
              <p className="py-6 text-center text-sm text-brand-ink/50">Loading…</p>
            ) : bill === null || bill.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-brand-ink/50">
                Nothing to pay right now.
              </p>
            ) : (
              <>
                <ul className="mt-3 divide-y divide-plum-ink/5">
                  {bill.items.map((it, i) => (
                    <li key={i} className="flex justify-between py-2 text-sm">
                      <span className="text-brand-ink">
                        {it.quantity}× {it.name}
                      </span>
                      <span className="font-semibold">{peso(it.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
                {/* Promo code */}
                {bill.discount > 0 ? (
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-mango/10 px-3 py-2 text-sm">
                    <span className="font-medium text-brand-ink">
                      🎟️ {bill.discountLabel ?? "Promo applied"}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-mango">−{peso(bill.discount)}</span>
                      <button
                        onClick={removeCode}
                        disabled={promoBusy}
                        className="text-xs text-brand-ink/45 underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                ) : (
                  <div className="mt-3">
                    <div className="flex gap-2">
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        placeholder="Promo code"
                        className="min-w-0 flex-1 rounded-xl border border-plum-ink/15 px-3 py-2 text-sm uppercase tracking-wide outline-none focus:border-brand-primary"
                      />
                      <button
                        onClick={() => applyCode()}
                        disabled={promoBusy || !code.trim()}
                        className="shrink-0 rounded-xl border border-brand-ink/15 px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
                      >
                        {promoBusy ? "…" : "Apply"}
                      </button>
                    </div>
                    {promoError && <p className="mt-1 text-xs text-guava">{promoError}</p>}
                    {codes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {codes.map((c) => (
                          <button
                            key={c.code}
                            onClick={() => applyCode(c.code)}
                            disabled={promoBusy}
                            title={c.title}
                            className="rounded-full border border-brand-primary/30 bg-brand-primary/5 px-2.5 py-1 text-xs font-semibold text-brand-primary disabled:opacity-50"
                          >
                            🎟️ {c.code} · {c.summary}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-3 space-y-1 border-t border-plum-ink/10 pt-3">
                  {bill.discount > 0 && (
                    <>
                      <div className="flex justify-between text-sm text-brand-ink/60">
                        <span>Subtotal</span>
                        <span>{peso(bill.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-mango">
                        <span>Discount</span>
                        <span>−{peso(bill.discount)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between font-heading text-lg font-bold">
                    <span>Total</span>
                    <span>{peso(bill.total)}</span>
                  </div>
                </div>

                {/* Split the bill — a helper for groups paying together */}
                <button
                  onClick={() => setSplitOpen((v) => !v)}
                  className="mt-3 w-full rounded-full border border-brand-ink/15 py-2.5 text-sm font-semibold text-brand-ink"
                >
                  👥 Split the bill {splitOpen ? "▲" : "▼"}
                </button>
                {splitOpen && (
                  <div className="mt-2 rounded-xl border border-brand-ink/10 p-3">
                    <div className="mb-3 flex gap-2">
                      {(["evenly", "item"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setSplitMode(m)}
                          className={`flex-1 rounded-full py-1.5 text-xs font-semibold ${
                            splitMode === m ? "bg-brand-primary text-white" : "bg-white text-brand-ink/70 ring-1 ring-brand-ink/10"
                          }`}
                        >
                          {m === "evenly" ? "Evenly" : "By item"}
                        </button>
                      ))}
                    </div>

                    {splitMode === "evenly" ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPeople((n) => Math.max(2, n - 1))}
                            className="h-8 w-8 rounded-full border border-brand-ink/15 text-lg leading-none"
                          >
                            −
                          </button>
                          <span className="w-16 text-center text-sm">{people} people</span>
                          <button
                            onClick={() => setPeople((n) => Math.min(50, n + 1))}
                            className="h-8 w-8 rounded-full border border-brand-ink/15 text-lg leading-none"
                          >
                            +
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-brand-ink/50">Each pays</p>
                          <p className="font-heading text-lg font-bold text-brand-primary">
                            {peso(Math.ceil(bill.total / people))}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <ul className="max-h-40 divide-y divide-plum-ink/5 overflow-y-auto">
                          {bill.items.map((it, i) => (
                            <li key={i}>
                              <label className="flex items-center gap-2 py-1.5 text-sm">
                                <input
                                  type="checkbox"
                                  checked={picked.has(i)}
                                  onChange={() =>
                                    setPicked((prev) => {
                                      const next = new Set(prev);
                                      next.has(i) ? next.delete(i) : next.add(i);
                                      return next;
                                    })
                                  }
                                />
                                <span className="flex-1 text-brand-ink">
                                  {it.quantity}× {it.name}
                                </span>
                                <span className="text-brand-ink/60">{peso(it.lineTotal)}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 flex justify-between border-t border-plum-ink/10 pt-2 text-sm font-semibold">
                          <span>Your items</span>
                          <span className="text-brand-primary">
                            {peso(bill.items.reduce((s, it, i) => (picked.has(i) ? s + it.lineTotal : s), 0))}
                          </span>
                        </div>
                      </>
                    )}
                    <p className="mt-2 text-center text-[11px] text-brand-ink/45">
                      Show this to your server — pay your share at the counter (cash or card).
                    </p>
                  </div>
                )}

                <p className="mt-5 text-center text-sm font-semibold text-brand-ink/70">How would you like to pay?</p>
                <div className="mt-3 space-y-2">
                  {gcash && (
                    <button
                      onClick={payGcashQr}
                      disabled={busy}
                      className="w-full rounded-full border border-sky-400/60 bg-sky-50 py-3 font-semibold text-sky-700 disabled:opacity-60"
                    >
                      📱 Pay with GCash QR
                    </button>
                  )}
                  <button
                    onClick={payCash}
                    disabled={busy}
                    className="w-full rounded-full border border-brand-ink/15 py-3 font-semibold text-brand-ink disabled:opacity-60"
                  >
                    💵 Pay with cash
                  </button>
                </div>
                {error && <p className="mt-2 text-center text-sm text-guava">{error}</p>}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
