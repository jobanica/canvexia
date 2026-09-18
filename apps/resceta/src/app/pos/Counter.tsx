"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { recordSale, type SaleState } from "./actions";
import { peso } from "@/lib/money";
import { useOnline } from "@/lib/useOnline";
import { totalSale, type DiscountType } from "@/lib/pharmacy/discount";
import {
  changeFor,
  scanMatch,
  searchProducts,
  shortfall,
  tenderedTotal,
  amountToCentavos,
  TENDER_METHODS,
} from "@/lib/pharmacy/counter-search";
import { redeemable } from "@/lib/pharmacy/customer-input";
import { IconCart, IconSearch, IconUserPlus } from "@/components/Icons";
import { ReceiptPrinter } from "./ReceiptPrinter";
import type { CatalogueRow } from "@/server/pharmacy/queries";

/**
 * The counter.
 *
 * SEARCH FIRST, because the list is not browsable. This screen used to render
 * every product as a row with plus and minus buttons — fine for a demo's forty
 * products, impossible for the 1,886 a real pharmacy imported on its first
 * morning. Nobody scrolls two thousand rows while somebody waits with a
 * prescription, so the box is focused on load and a scanner can drive the whole
 * sale without anybody touching the mouse.
 *
 * The totals shown here are computed with the SAME function the server uses
 * (`totalSale`), not a re-implementation in the browser. A till that shows one
 * number and charges another is the worst possible bug in a pharmacy, and two
 * copies of the SC/PWD formula would be exactly how it happened. The server
 * still recomputes — this is a preview, never the source of truth.
 */

export interface LoyaltyMember {
  id: string;
  name: string;
  phone: string | null;
  pointsBalance: number;
}

const CARD = "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl";
const FIELD =
  "w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none";

export function Counter({
  vatRatePct,
  products,
  canDispenseRx,
  branchName,
  members,
  loyaltyCentavosPerPoint,
  autoPrint,
  receiptPaperMm,
}: {
  vatRatePct: number;
  products: CatalogueRow[];
  /**
   * Whether THIS person may complete a cart containing a prescription-only
   * item. Passed in rather than derived here: the role lives in the session,
   * and the server checks it again before writing anything. This only decides
   * what the counter says before they try.
   */
  canDispenseRx: boolean;
  branchName: string;
  members: LoyaltyMember[];
  loyaltyCentavosPerPoint: number;
  /** Print the receipt as soon as the sale settles. A pharmacy setting. */
  autoPrint: boolean;
  /** 58 or 80. The frame has to lay the receipt out at its real paper width. */
  receiptPaperMm: number;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [discountType, setDiscountType] = useState<DiscountType>("none");
  const [query, setQuery] = useState("");
  /*
    THE TEXT THE CASHIER TYPED, not centavos.

    Holding centavos here meant re-rendering the box as `(c / 100).toFixed(2)`
    on every keystroke, which made the field impossible to type into past its
    first digit. A money field keeps the raw text and derives the number.
  */
  const [tenders, setTenders] = useState<{ method: string; input: string }[]>([
    { method: "cash", input: "" },
  ]);
  const [memberQuery, setMemberQuery] = useState("");
  const [member, setMember] = useState<LoyaltyMember | null>(null);
  // Raw text, for the same reason the tender amounts are: a number coerced on
  // every keystroke eats a leading zero and fights the person typing.
  const [redeemInput, setRedeemInput] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const online = useOnline();
  const [state, formAction, pending] = useActionState<SaleState, FormData>(
    recordSale,
    { status: "idle" },
  );

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([productId, quantity]) => ({ productId, quantity })),
    [cart],
  );

  const totals = useMemo(
    () =>
      totalSale(
        lines.map((l) => ({
          unitPriceCentavos: byId.get(l.productId)?.priceCentavos ?? 0,
          quantity: l.quantity,
        })),
        { discountType, vatRatePct },
      ),
    [lines, byId, discountType, vatRatePct],
  );

  const shown = useMemo(() => searchProducts(products, query), [products, query]);

  const memberHits = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return [];
    return members
      .filter((m) => m.name.toLowerCase().includes(q) || (m.phone ?? "").includes(q))
      .slice(0, 6);
  }, [members, memberQuery]);

  // Capped at the balance AND the bill by the same helper the server uses, so
  // the figure on screen is the figure that will be applied.
  const redeemPoints = Math.max(0, Math.floor(Number(redeemInput.replace(/[^0-9]/g, "")) || 0));
  const redemption = member
    ? redeemable(redeemPoints, member.pointsBalance, totals.totalCentavos, loyaltyCentavosPerPoint)
    : { points: 0, centavos: 0 };
  const due = totals.totalCentavos - redemption.centavos;

  const needsRx = lines.some((l) => byId.get(l.productId)?.requiresPrescription);
  const blockedOnRx = needsRx && !canDispenseRx;
  const statutory = discountType === "sc" || discountType === "pwd";
  const amounts = tenders.map((t) => ({
    method: t.method,
    amountCentavos: amountToCentavos(t.input),
  }));
  const change = changeFor(due, amounts);
  const owed = shortfall(due, amounts);
  const paid = tenderedTotal(amounts);

  // After a completed sale the cart has to be empty and the box focused, or the
  // next customer is rung up on top of the last one's items.
  useEffect(() => {
    if (state.status !== "done") return;
    setCart({});
    setDiscountType("none");
    setTenders([{ method: "cash", input: "" }]);
    setMember(null);
    setMemberQuery("");
    setRedeemInput("");
    setQuery("");
    searchBox.current?.focus();
  }, [state]);

  function add(id: string, delta: number) {
    setCart((c) => {
      const next = Math.max(0, (c[id] ?? 0) + delta);
      const onHand = byId.get(id)?.onHand ?? 0;
      return { ...c, [id]: Math.min(next, onHand) };
    });
  }

  /**
   * Enter in the search box. A BARCODE SCANNER IS A KEYBOARD that types fast
   * and presses Enter, so there is no separate scan mode — but only an
   * identifier match adds silently. A name never does: "Biogesic" matching one
   * of four Biogesics is how the wrong strength gets sold.
   */
  function onScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault(); // never submit the sale from the search box
    const hit = scanMatch(products, query);
    if (!hit) {
      setFlash(shown.length > 0 ? "Tap the item you want." : `Nothing matches “${query}”.`);
      return;
    }
    if (hit.onHand === 0) {
      setFlash(`${hit.name} is out of stock.`);
      return;
    }
    add(hit.id, 1);
    setFlash(null);
    setQuery("");
  }

  const cartLines = lines.map((l) => ({ ...l, product: byId.get(l.productId)! }));

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_23rem]">
      {/* No pharmacy id in this form. It comes from the session server-side. */}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <input type="hidden" name="discountType" value={discountType} />
      <input type="hidden" name="customerId" value={member?.id ?? ""} />
      <input type="hidden" name="pointsToRedeem" value={redemption.points} />
      <input type="hidden" name="payments" value={JSON.stringify(amounts.filter((t) => t.amountCentavos > 0))} />

      {/* ── SEARCH AND THE SHELF ─────────────────────────────────────────── */}
      <section className={`${CARD} p-4 sm:p-5`}>
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchBox}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setFlash(null);
            }}
            onKeyDown={onScan}
            placeholder="Scan barcode or search name / SKU…"
            aria-label="Scan barcode or search the catalogue"
            className={`${FIELD} py-3 pl-10`}
          />
        </div>
        {flash && <p className="mt-2 text-sm text-amber-300">{flash}</p>}

        <div className="mt-4 max-h-[30rem] overflow-y-auto pr-1">
          {shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              Nothing matches &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {shown.map((p) => {
                const out = p.onHand === 0;
                const qty = cart[p.id] ?? 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => add(p.id, 1)}
                      disabled={out}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                        qty > 0
                          ? "border-violet-400/50 bg-violet-500/10"
                          : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
                      } ${out ? "opacity-40" : ""}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">
                          {p.name}
                          {p.requiresPrescription && (
                            <span className="ml-2 rounded bg-violet-500/20 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase text-violet-200">
                              Rx
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-400">
                          {p.sku ?? "no SKU"} ·{" "}
                          {out ? "out of stock" : `${p.onHand} ${p.unit}`}
                          {qty > 0 && (
                            <span className="ml-2 font-semibold text-violet-300">
                              {qty} in cart
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-white">
                        {peso(p.priceCentavos)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ── THE CART ─────────────────────────────────────────────────────── */}
      <aside className={`${CARD} flex flex-col p-4 sm:p-5`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <IconCart className="h-4 w-4 text-slate-300" />
            Cart
          </h2>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-300">
            {branchName}
          </span>
        </div>

        {cartLines.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Cart is empty. Scan or tap a product.
          </p>
        ) : (
          <ul className="mb-4 max-h-64 space-y-2 overflow-y-auto pr-1">
            {cartLines.map((l) => (
              <li key={l.productId} className="rounded-xl bg-white/[0.04] p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-white">
                    {l.product.name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-white">
                    {peso(l.product.priceCentavos * l.quantity)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => add(l.productId, -1)}
                    className="h-7 w-7 rounded-lg border border-white/15 text-slate-200"
                    aria-label={`Remove one ${l.product.name}`}
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm tabular-nums text-white">
                    {l.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => add(l.productId, 1)}
                    disabled={l.quantity >= l.product.onHand}
                    className="h-7 w-7 rounded-lg border border-white/15 text-slate-200 disabled:opacity-30"
                    aria-label={`Add one ${l.product.name}`}
                  >
                    +
                  </button>
                  <span className="ml-auto text-xs text-slate-500">
                    {peso(l.product.priceCentavos)} each
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* ── LOYALTY ────────────────────────────────────────────────────── */}
        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          {member ? (
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{member.name}</p>
                  <p className="text-xs text-slate-400">
                    {member.pointsBalance.toLocaleString("en-PH")} points
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMember(null);
                    setRedeemInput("");
                  }}
                  className="shrink-0 text-xs text-slate-400 underline hover:text-white"
                >
                  Remove
                </button>
              </div>
              {loyaltyCentavosPerPoint > 0 && member.pointsBalance > 0 && totals.totalCentavos > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={redeemInput}
                    onChange={(e) => setRedeemInput(e.target.value)}
                    placeholder="Points to use"
                    aria-label="Points to redeem"
                    className={`${FIELD} py-1.5 text-xs`}
                  />
                  <button
                    type="button"
                    onClick={() => setRedeemInput(String(member.pointsBalance))}
                    className="shrink-0 rounded-lg border border-white/15 px-2 py-1.5 text-xs text-slate-200"
                  >
                    Use all
                  </button>
                </div>
              )}
              {redemption.centavos > 0 && (
                <p className="mt-1.5 text-xs text-emerald-300">
                  −{peso(redemption.centavos)} from {redemption.points} points
                </p>
              )}
            </div>
          ) : (
            <div>
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder="Add loyalty member (name or phone)…"
                  aria-label="Find a loyalty member"
                  className={`${FIELD} py-2 pl-9 text-xs`}
                />
              </div>
              {memberHits.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {memberHits.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setMember(m);
                          setMemberQuery("");
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/10"
                      >
                        <span className="min-w-0 truncate text-white">{m.name}</span>
                        <span className="shrink-0 text-slate-400">{m.pointsBalance} pts</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/customers"
                className="mt-2 flex items-center gap-1.5 text-xs text-slate-300 hover:text-white"
              >
                <IconUserPlus className="h-3.5 w-3.5" />
                New loyalty member
              </Link>
            </div>
          )}
        </div>

        {/* ── MONEY ──────────────────────────────────────────────────────── */}
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-300">Subtotal</dt>
            <dd className="tabular-nums text-white">{peso(totals.subtotalCentavos)}</dd>
          </div>

          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-300">Discount type</dt>
            <dd>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                aria-label="Discount type"
                className="rounded-lg border border-white/15 bg-white/[0.06] px-2 py-1.5 text-sm text-white"
              >
                <option value="none">None</option>
                <option value="sc">Senior Citizen</option>
                <option value="pwd">PWD</option>
              </select>
            </dd>
          </div>

          {totals.discountCentavos > 0 && (
            <div className="flex items-center justify-between text-emerald-300">
              <dt>Discount</dt>
              <dd className="tabular-nums">−{peso(totals.discountCentavos)}</dd>
            </div>
          )}

          {redemption.centavos > 0 && (
            <div className="flex items-center justify-between text-emerald-300">
              <dt>Points</dt>
              <dd className="tabular-nums">−{peso(redemption.centavos)}</dd>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-white/10 pt-2">
            <dt className="text-base font-semibold text-white">Total</dt>
            <dd className="text-xl font-bold tabular-nums text-white">{peso(due)}</dd>
          </div>
        </dl>

        {/*
          THE STATUTORY DISCOUNT NEEDS THE ID ON THE RECORD. The server refuses
          without it, so the field appears the moment the discount is chosen
          rather than after a rejected sale.
        */}
        {statutory && (
          <div className="mt-3 space-y-2">
            <input
              name="beneficiaryIdNo"
              required
              placeholder={discountType === "sc" ? "Senior Citizen ID no." : "PWD ID no."}
              aria-label="Beneficiary ID number"
              className={`${FIELD} text-xs`}
            />
            <input
              name="beneficiaryName"
              placeholder="Name on the ID"
              aria-label="Name on the ID"
              className={`${FIELD} text-xs`}
            />
          </div>
        )}

        {needsRx && (
          <input
            name="prescriptionRef"
            required
            placeholder="Prescription reference"
            aria-label="Prescription reference"
            className={`${FIELD} mt-3 text-xs`}
          />
        )}

        {/* ── TENDER ─────────────────────────────────────────────────────── */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Tender
          </p>
          <div className="space-y-2">
            {tenders.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={t.method}
                  onChange={(e) =>
                    setTenders((ts) =>
                      ts.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)),
                    )
                  }
                  aria-label={`Payment method ${i + 1}`}
                  className="shrink-0 rounded-lg border border-white/15 bg-white/[0.06] px-2 py-2 text-sm text-white"
                >
                  {TENDER_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {/*
                  text, NOT type="number": a number input fights a cashier over
                  a typed comma, shows spinner arrows nobody wants on a till,
                  and silently blanks itself on input the browser dislikes.
                  inputMode gives a phone or tablet the numeric keypad, which is
                  the only thing the number type was buying here.
                */}
                <input
                  type="text"
                  inputMode="decimal"
                  value={t.input}
                  onChange={(e) =>
                    setTenders((ts) =>
                      ts.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)),
                    )
                  }
                  placeholder="0.00"
                  aria-label={`Amount ${i + 1}`}
                  className={`${FIELD} text-right tabular-nums`}
                />
                {tenders.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setTenders((ts) => ts.filter((_, j) => j !== i))}
                    className="shrink-0 text-xs text-slate-400 hover:text-white"
                    aria-label={`Remove payment ${i + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setTenders((ts) => {
                  // Pre-filled with what is still owed, which is the number the
                  // cashier was about to type anyway.
                  const remaining = shortfall(
                    due,
                    ts.map((t) => ({ method: t.method, amountCentavos: amountToCentavos(t.input) })),
                  );
                  return [
                    ...ts,
                    { method: "gcash", input: remaining > 0 ? (remaining / 100).toFixed(2) : "" },
                  ];
                })
              }
              className="text-xs text-violet-300 underline hover:text-violet-200"
            >
              + Add payment method
            </button>
            <button
              type="button"
              onClick={() =>
                setTenders([
                  { method: tenders[0]?.method ?? "cash", input: (due / 100).toFixed(2) },
                ])
              }
              className="text-xs text-slate-300 underline hover:text-white"
            >
              Exact cash
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-slate-300">{owed > 0 ? "Still owed" : "Change"}</span>
            <span
              className={`text-lg font-bold tabular-nums ${
                owed > 0 ? "text-amber-300" : "text-emerald-300"
              }`}
            >
              {peso(owed > 0 ? owed : change)}
            </span>
          </div>
        </div>

        {/* ── COMPLETE ───────────────────────────────────────────────────── */}
        {blockedOnRx && (
          <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            This cart contains a prescription-only item. A pharmacist has to complete it.
          </p>
        )}
        {!online && (
          <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            No connection — a sale cannot be recorded until it comes back.
          </p>
        )}
        {state.status === "error" && (
          <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            {state.message}
          </p>
        )}
        {state.status === "done" && (
          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            <p className="font-semibold">
              Receipt {state.receiptNumber} · change {peso(state.changeCentavos)}
            </p>
            {/*
              The link stays even when the receipt prints itself. Auto-print
              covers the ordinary case; a jammed roll, a printer that was off,
              or a customer asking for a second copy is the case where somebody
              needs the document itself.
            */}
            <Link href={`/receipts/${state.saleId}/print`} className="underline">
              Open the receipt
            </Link>
            {autoPrint && (
              <ReceiptPrinter saleId={state.saleId} paperMm={receiptPaperMm} />
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setCart({});
              setDiscountType("none");
              setTenders([{ method: "cash", input: "" }]);
              setMember(null);
              setRedeemInput("");
              searchBox.current?.focus();
            }}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-slate-200"
          >
            Clear
          </button>
          <button
            disabled={pending || lines.length === 0 || blockedOnRx || !online || owed > 0}
            className="flex-1 rounded-xl brand-gradient px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Recording…" : "Complete sale"}
          </button>
        </div>
        {lines.length > 0 && owed > 0 && (
          <p className="mt-2 text-center text-xs text-slate-400">
            {peso(owed)} still to be tendered — or press Exact cash.
          </p>
        )}
        {paid > 0 && owed === 0 && lines.length === 0 && (
          <p className="mt-2 text-center text-xs text-slate-400">Cart is empty.</p>
        )}
      </aside>
    </form>
  );
}
