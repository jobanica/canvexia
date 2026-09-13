"use client";

import { useActionState, useState } from "react";
import { updatePrintSettings, type FormState } from "@/server/printing/settings";
import { DRAWER_POLICY_LABEL, type DrawerPolicy } from "@/lib/printing/drawer";
import type { KitchenPrintMethod } from "@/lib/printing/printer-config";
import { SubmitButton } from "./SubmitButton";

type Method = "network" | "cloud" | "bluetooth" | "os_dialog";

const METHOD_HELP: Record<Method, string> = {
  network:
    "Wi-Fi/USB ESC/POS printer at a fixed cashier station, via a small local print-bridge agent. Most reliable default.",
  cloud:
    "Printer polls Servd for jobs (Star CloudPRNT / Epson Server Direct Print). Works on ANY device, including iPad/iPhone.",
  bluetooth:
    "Web Bluetooth — Chromium on desktop/Android only (NOT Safari/iOS), BLE ESC/POS printers only.",
  os_dialog:
    "Print the HTML ticket via the OS print dialog / AirPrint. Device-agnostic fallback.",
};

export function PrintSettingsForm({
  initial,
  cloudPollUrl,
  kitchenPollUrl,
}: {
  initial: {
    printMethod: Method;
    autoPrint: boolean;
    kitchenDisplay: boolean;
    bridgeUrl: string;
    receiptAddress: string;
    receiptPhone: string;
    receiptWebsite: string;
    receiptFooter: string;
    receiptShowVat: boolean;
    receiptShowCustomer: boolean;
    receiptShowCashTendered: boolean;
    kitchenShowAddress: boolean;
    kitchenSeparate: boolean;
    kitchenMethod: KitchenPrintMethod;
    kitchenBridgeUrl: string;
    cardSurchargePercent: string;
    payFirst: boolean;
    autoPrintReceipt: boolean;
    openDrawerOn: DrawerPolicy;
  };
  cloudPollUrl: string | null;
  kitchenPollUrl: string | null;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    updatePrintSettings,
    null,
  );
  const [method, setMethod] = useState<Method>(initial.printMethod);
  const [autoPrint, setAutoPrint] = useState(initial.autoPrint);
  const [address, setAddress] = useState(initial.receiptAddress);
  const [phone, setPhone] = useState(initial.receiptPhone);
  const [website, setWebsite] = useState(initial.receiptWebsite);
  const [footer, setFooter] = useState(initial.receiptFooter);
  const [showVat, setShowVat] = useState(initial.receiptShowVat);
  const [showCustomer, setShowCustomer] = useState(initial.receiptShowCustomer);
  const [showCashTendered, setShowCashTendered] = useState(initial.receiptShowCashTendered);
  const [kitchenAddress, setKitchenAddress] = useState(initial.kitchenShowAddress);
  const [kitchenSeparate, setKitchenSeparate] = useState(initial.kitchenSeparate);
  const [kitchenMethod, setKitchenMethod] = useState<KitchenPrintMethod>(initial.kitchenMethod);
  const [surcharge, setSurcharge] = useState(initial.cardSurchargePercent);
  const [payFirst, setPayFirst] = useState(initial.payFirst);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(initial.autoPrintReceipt);
  const [openDrawerOn, setOpenDrawerOn] = useState<DrawerPolicy>(initial.openDrawerOn);

  return (
    <form
      action={action}
      className="max-w-xl space-y-5 rounded-tile border border-plum-ink/10 bg-white p-5"
    >
      <div>
        <label className="block text-sm font-semibold">Print method</label>
        <select
          name="printMethod"
          value={method}
          onChange={(e) => setMethod(e.target.value as Method)}
          className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
        >
          <option value="network">Network / USB (ESC/POS)</option>
          <option value="cloud">Cloud poll (CloudPRNT / Server Direct)</option>
          <option value="bluetooth">Bluetooth (Web Bluetooth)</option>
          <option value="os_dialog">OS print dialog / AirPrint</option>
        </select>
        <p className="mt-2 text-sm text-plum-ink/60">{METHOD_HELP[method]}</p>
      </div>

      {/* Kitchen routing: on-screen display vs printed tickets */}
      <div className="rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="kitchenDisplay"
            defaultChecked={initial.kitchenDisplay}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold">Use a kitchen display screen</span>
            <span className="mt-0.5 block text-plum-ink/55">
              On — accepted orders show on the Kitchen screen. Off — no screen: a
              <strong> kitchen ticket prints automatically</strong> when an order is accepted or
              created, so you can hand it to the kitchen.
            </span>
          </span>
        </label>

        <label className="mt-3 flex items-start gap-2 border-t border-plum-ink/10 pt-3 text-sm">
          <input
            type="checkbox"
            name="kitchenShowAddress"
            checked={kitchenAddress}
            onChange={(e) => setKitchenAddress(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold">Show delivery addresses to the kitchen</span>
            <span className="mt-0.5 block text-plum-ink/55">
              For kitchens that work by zone: everything heading the same way is visible
              together, so it can be cooked and bagged in one run instead of one ticket at a
              time. Off by default — it puts customers&apos; home addresses on a screen the whole
              line can read.
            </span>
          </span>
        </label>

        {/* A second printer at the pass. */}
        <label className="mt-3 flex items-start gap-2 border-t border-plum-ink/10 pt-3 text-sm">
          <input
            type="checkbox"
            name="kitchenSeparate"
            checked={kitchenSeparate}
            onChange={(e) => setKitchenSeparate(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold">Kitchen has its own printer</span>
            <span className="mt-0.5 block text-plum-ink/55">
              Dockets print at the pass; the cashier&apos;s printer is left for bills and
              receipts. Off — one printer does both, as before.
            </span>
          </span>
        </label>

        {kitchenSeparate && (
          <div className="mt-3 space-y-3 rounded-lg border border-plum-ink/10 bg-white p-3">
            <div>
              <label className="block text-sm font-semibold">How the kitchen printer connects</label>
              <select
                name="kitchenMethod"
                value={kitchenMethod}
                onChange={(e) => setKitchenMethod(e.target.value as KitchenPrintMethod)}
                className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
              >
                <option value="network">Network / USB (its own print-bridge)</option>
                <option value="cloud">Cloud poll (CloudPRNT / Server Direct)</option>
                <option value="bluetooth">Bluetooth (paired at the cashier)</option>
              </select>
              <p className="mt-1 text-xs text-plum-ink/50">
                {kitchenMethod === "bluetooth"
                  ? "Cheapest to set up — nothing to install. But the cashier's device holds the connection, so the kitchen printer has to be within Bluetooth range of it and that device has to stay awake with this page open. Choose Network if the kitchen is far from the till or the tablet gets locked."
                  : "Driven by the server, so dockets keep printing whatever the till is doing — asleep, on another screen, or printing over Bluetooth itself."}
              </p>
              <p className="mt-1 text-xs text-plum-ink/50">
                The OS print dialog isn&apos;t offered: it hands a page to whichever printer the
                device has selected, with no way to say &ldquo;the other one&rdquo;.
              </p>
            </div>

            {kitchenMethod === "network" && (
              <div>
                <label className="block text-sm font-semibold">Kitchen print-bridge URL</label>
                <input
                  name="kitchenBridgeUrl"
                  defaultValue={initial.kitchenBridgeUrl}
                  placeholder="http://192.168.1.60:8080/print"
                  className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
                />
                <p className="mt-1 text-xs text-plum-ink/50">
                  The agent next to the KITCHEN printer — a different address from the
                  cashier&apos;s.
                </p>
              </div>
            )}

            {kitchenMethod === "cloud" && (
              <div>
                <label className="block text-sm font-semibold">Kitchen printer poll URL</label>
                {kitchenPollUrl ? (
                  <code className="mt-1 block break-all rounded-lg bg-cream px-3 py-2 text-xs">
                    {kitchenPollUrl}
                  </code>
                ) : (
                  <p className="mt-1 rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/60">
                    Save to generate it — the kitchen printer gets its own token, which is how
                    it receives dockets instead of the till&apos;s receipts.
                  </p>
                )}
                <p className="mt-1 text-xs text-plum-ink/50">
                  Point the KITCHEN printer at this URL, not the cashier&apos;s.
                </p>
              </div>
            )}

            {kitchenMethod === "bluetooth" && (
              <p className="rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/70">
                <strong>Save this page first.</strong> A{" "}
                <strong>Connect kitchen printer</strong> button then appears on the cashier
                screen, in the left sidebar under the till&apos;s own printer button — on a phone,
                open the ☰ menu to see it. Pair the KITCHEN printer there, not the same device as
                the receipt printer. Needs Chrome on Android or a desktop; Web Bluetooth doesn&apos;t
                exist on iPhone or iPad.
              </p>
            )}

            <p className="text-xs text-plum-ink/50">
              Turn <strong>Use a kitchen display screen</strong> off above if you want a docket
              to print automatically the moment an order is accepted.
            </p>
          </div>
        )}
      </div>

      {method === "bluetooth" && (
        <p className="rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/70">
          On an iPhone/iPad? Bluetooth won&apos;t work — choose Cloud poll or OS
          print instead.
        </p>
      )}

      {method === "network" && (
        <div>
          <label className="block text-sm font-semibold">Print-bridge URL</label>
          <input
            name="bridgeUrl"
            defaultValue={initial.bridgeUrl}
            placeholder="http://192.168.1.50:8080/print"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
          <p className="mt-1 text-xs text-plum-ink/50">
            The local agent that relays ESC/POS bytes to the printer over TCP.
          </p>
        </div>
      )}

      {method === "cloud" && cloudPollUrl && (
        <div>
          <label className="block text-sm font-semibold">Printer poll URL</label>
          <code className="mt-1 block break-all rounded-lg bg-cream px-3 py-2 text-xs">
            {cloudPollUrl}
          </code>
          <p className="mt-1 text-xs text-plum-ink/50">
            Configure your CloudPRNT printer to poll this URL. (Saved after you
            pick Cloud and submit.)
          </p>
        </div>
      )}

      {/* Kitchen workflow — show new orders on a screen, or print a docket. */}
      <div className="border-t border-plum-ink/10 pt-5">
        <label className="block text-sm font-semibold">Kitchen workflow</label>
        <p className="mt-1 text-sm text-plum-ink/55">
          How should the kitchen receive each new order?
        </p>
        {/* The server reads autoPrint from this hidden field. */}
        <input type="hidden" name="autoPrint" value={autoPrint ? "on" : "off"} />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setAutoPrint(false)}
            className={`rounded-lg border p-3 text-left ${
              !autoPrint ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-plum-ink/15"
            }`}
          >
            <span className="block text-sm font-semibold">🖥️ Kitchen Display Screen</span>
            <span className="mt-1 block text-xs text-plum-ink/55">
              New orders appear live on the Kitchen screen (/kitchen). Staff tap to advance them.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAutoPrint(true)}
            className={`rounded-lg border p-3 text-left ${
              autoPrint ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-plum-ink/15"
            }`}
          >
            <span className="block text-sm font-semibold">🧾 Print kitchen tickets</span>
            <span className="mt-1 block text-xs text-plum-ink/55">
              A docket prints automatically for every new order. (The Kitchen screen still works too.)
            </span>
          </button>
        </div>
        {autoPrint && (method === "bluetooth" || method === "os_dialog") && (
          <p className="mt-2 rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/70">
            Heads up: with {method === "bluetooth" ? "Bluetooth" : "OS print"}, tickets can&apos;t print
            unattended — the order opens on the cashier device for printing. For hands-off kitchen
            printing, use a Network/USB or Cloud printer.
          </p>
        )}
      </div>

      {/* What happens the moment a payment is settled. Both used to be fixed:
          the receipt always printed, and the drawer never opened. */}
      <div className="border-t border-plum-ink/10 pt-5">
        <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/55">
          When a payment is taken
        </h2>

        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="autoPrintReceipt"
            checked={autoPrintReceipt}
            onChange={(e) => setAutoPrintReceipt(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold">Print a receipt automatically</span>
            <span className="mt-0.5 block text-xs text-plum-ink/55">
              Turn this off if most customers don&apos;t take one — you can still print any
              receipt on demand from the ticket. Saves a roll a day on a busy till.
            </span>
          </span>
        </label>

        <div className="mt-4">
          <label className="block text-sm font-semibold">Open the cash drawer</label>
          <p className="mt-0.5 text-xs text-plum-ink/55">
            The drawer plugs into the receipt printer, so it opens when the printer is told to.
            A card or e-wallet sale puts nothing in it, which is why cash-only is the default.
          </p>
          <select
            name="openDrawerOn"
            value={openDrawerOn}
            onChange={(e) => setOpenDrawerOn(e.target.value as DrawerPolicy)}
            className="mt-2 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          >
            {(Object.keys(DRAWER_POLICY_LABEL) as DrawerPolicy[]).map((k) => (
              <option key={k} value={k}>{DRAWER_POLICY_LABEL[k]}</option>
            ))}
          </select>
          {openDrawerOn !== "never" && method === "os_dialog" && (
            <p className="mt-2 rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/70">
              Heads up: the OS print dialog can&apos;t send a drawer command — a browser print job
              is a page, not a printer control code. Use Network/USB, Cloud or Bluetooth for this.
            </p>
          )}
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="payFirst"
            checked={payFirst}
            onChange={(e) => setPayFirst(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold">Take payment before the food is made</span>
            <span className="mt-0.5 block text-xs text-plum-ink/55">
              For counters where the customer orders, pays, and only then sits down. The
              till leads with <strong>Take payment</strong> instead of Send to kitchen, and
              nothing reaches the kitchen until the money is in. Applies to dine-in and
              takeout — the two where the customer is standing at the counter. Either way
              the cashier can still send an order unpaid, or take payment on one that
              wasn&apos;t going to be.
            </span>
          </span>
        </label>

        <div className="mt-4">
          <label className="block text-sm font-semibold">Card fee</label>
          <p className="mt-0.5 text-xs text-plum-ink/55">
            Added on top when a customer pays by card at the counter, to cover what the
            terminal charges you. It shows as its own line on the receipt, and on a split
            bill it only applies to the part that goes on the card. Leave blank for none.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              name="cardSurchargePercent"
              value={surcharge}
              onChange={(e) => setSurcharge(e.target.value)}
              type="number"
              step="0.01"
              min="0"
              max="20"
              inputMode="decimal"
              placeholder="3.5"
              className="w-28 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm tabular-nums"
            />
            <span className="text-sm font-semibold text-plum-ink/60">% of the card payment</span>
          </div>
        </div>
      </div>

      {/* Receipt design */}
      <div className="border-t border-plum-ink/10 pt-5">
        <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/55">
          Receipt design
        </h2>
        <p className="mt-1 text-sm text-plum-ink/55">
          These appear on printed receipts. The restaurant name comes from your branding.
        </p>

        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm font-semibold">Address</label>
            <input
              name="receiptAddress"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={120}
              placeholder="123 Culinary Avenue, Davao City"
              className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold">Phone</label>
              <input
                name="receiptPhone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={60}
                placeholder="(082) 123-4567"
                className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold">Website</label>
              <input
                name="receiptWebsite"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                maxLength={120}
                placeholder="www.yourrestaurant.com"
                className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold">Footer message</label>
            <textarea
              name="receiptFooter"
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Thank you for dining with us! Please come again."
              className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
            />
            <p className="mt-1 text-xs text-plum-ink/50">Tip: use a new line for a second footer line.</p>
          </div>

          {/* VAT line toggle */}
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="receiptShowVat" checked={showVat} onChange={(e) => setShowVat(e.target.checked)} />
            Show the “VAT (12% incl.)” line on receipts
          </label>
          <p className="-mt-2 text-xs text-plum-ink/50">
            Turn off if you&apos;re non-VAT registered (e.g. a percentage-tax/BMBE seller). Prices are
            unchanged — only the VAT breakdown line is hidden.
          </p>

          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              name="receiptShowCustomer"
              checked={showCustomer}
              onChange={(e) => setShowCustomer(e.target.checked)}
            />
            Print who the order is for
          </label>
          <p className="-mt-2 text-xs text-plum-ink/50">
            Name, contact number, and the delivery address on delivery orders. This is what a
            rider reads — without it they&apos;re back in Facebook or the app looking for where
            they&apos;re going and a number to ring. Dine-in receipts are unaffected.
          </p>

          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              name="receiptShowCashTendered"
              checked={showCashTendered}
              onChange={(e) => setShowCashTendered(e.target.checked)}
            />
            Print cash received and change
          </label>
          <p className="-mt-2 text-xs text-plum-ink/50">
            On cash sales only. Settles the &ldquo;I gave you a thousand&rdquo; conversation, and lets
            the customer check their change on the way out instead of at the counter.
          </p>
        </div>

        {/* Live preview */}
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold text-plum-ink/50">Preview</p>
          <pre className="mx-auto max-w-[280px] whitespace-pre-wrap rounded-lg border border-plum-ink/15 bg-white p-3 text-center font-mono text-[11px] leading-snug text-black">
{`${(address || phone || website || footer ? "YOUR RESTAURANT" : "YOUR RESTAURANT")}
${[address, phone, website].filter(Boolean).join("\n")}
TABLE 12
--------------------------------
2x Caesar Salad           ₱24.00
Grilled Salmon            ₱22.00
--------------------------------
${showVat ? "VAT (12% incl.)            ₱4.93\n" : ""}TOTAL                     ₱46.00${footer ? `\n\n${footer}` : ""}`}
          </pre>
        </div>
      </div>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      <SubmitButton>Save settings</SubmitButton>
    </form>
  );
}
