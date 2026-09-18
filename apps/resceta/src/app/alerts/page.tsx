import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate, manilaExpiry } from "@/lib/money";
import { branchContext } from "@/server/pharmacy/branches";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import { alertsFor, type ExpiringRow } from "@/server/pharmacy/alerts";
import { BUCKET_LABEL, type ExpiryBucket } from "@/lib/pharmacy/alerts";
import { AlertWindow, ExportCsv, PrintButton, TiedUp, WriteOffButton } from "./AlertsClient";

export const dynamic = "force-dynamic";

/**
 * Everything that needs doing about stock, on one screen, in four tabs.
 *
 * WHY TABS RATHER THAN ONE LONG PAGE. These are four different jobs done by
 * different people at different times: a pharmacist checks expiry at opening,
 * a buyer works the low-stock list on order day, and the owner looks at dead
 * stock when they wonder where the cash went. Stacked into one scroll, each of
 * them reads past the other three.
 *
 * THE TAB IS IN THE URL, so it can be bookmarked, reloaded and sent to the
 * person who actually places the order.
 *
 * NO PERMISSION GATE ON THE PAGE. A cashier who can see that the Amoxicillin on
 * the shelf expired last week is a cashier who does not sell it. MONEY is gated
 * — tied-up value and costs are the owner's business — but dates and counts are
 * not.
 */

const TABS = ["low", "expiring", "dead", "slow"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  low: "Low stock",
  expiring: "Expiring",
  dead: "Dead stock",
  slow: "Slow-moving",
};

const CARD = "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl";
const TH = "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400";
const TD = "px-4 py-2.5 text-sm";

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; bucket?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const { tab: rawTab, bucket: rawBucket } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "low";

  const showMoney = can(staff.role, "viewReports");
  const canStock = can(staff.role, "manageStock");
  const branch = await branchContext(staff.pharmacyId);

  const settings = await pharmacyDb(staff.pharmacyId, (tx) =>
    tx.pharmacy.findUnique({
      where: { id: staff.pharmacyId },
      select: { expiryAlertDays: true, deadStockDays: true },
    }),
  );

  const data = await alertsFor(staff.pharmacyId, {
    expiryWindowDays: settings?.expiryAlertDays ?? 90,
    deadStockDays: settings?.deadStockDays ?? 90,
    branch,
  });

  const counts: Record<Tab, number> = {
    low: data.low.length,
    expiring: data.expiring.length,
    dead: data.dead.length,
    slow: data.slow.length,
  };

  const where = branch.all ? "every branch" : (branch.current?.name ?? "Main Branch");

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p className="mt-1 text-sm text-slate-300">
          Low stock and expiring inventory for {where}. On-hand excludes expired
          batches — they are not sellable, so they are not counted.
        </p>

        <nav data-print-hide className="mt-5 inline-flex flex-wrap gap-1 rounded-2xl bg-white/[0.06] p-1">
          {TABS.map((t) => (
            <Link
              key={t}
              href={`/alerts?tab=${t}`}
              className={`rounded-xl px-3.5 py-2 text-sm transition ${
                tab === t
                  ? "bg-white/15 font-semibold text-white"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {TAB_LABEL[t]} ({counts[t]})
            </Link>
          ))}
        </nav>

        <div className="mt-6">
          {tab === "low" && (
            <LowStock rows={data.low} canStock={canStock} noReorderPoint={data.noReorderPoint} />
          )}
          {tab === "expiring" && (
            <Expiring
              rows={data.expiring}
              bucket={rawBucket}
              windowDays={data.windowDays}
              canStock={canStock}
              showMoney={showMoney}
            />
          )}
          {tab === "dead" && (
            <DeadStock rows={data.dead} days={data.deadDays} showMoney={showMoney} />
          )}
          {tab === "slow" && <SlowMoving rows={data.slow} showMoney={showMoney} />}
        </div>
      </main>
    </AppShell>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className={`${CARD} p-6 text-sm text-emerald-200`}>{children}</p>
  );
}

/* ── LOW STOCK ──────────────────────────────────────────────────────────── */

function LowStock({
  rows,
  canStock,
  noReorderPoint,
}: {
  rows: { productId: string; name: string; unit: string; onHand: number; reorderPoint: number; suggested: number }[];
  canStock: boolean;
  noReorderPoint: number;
}) {
  const nudge = noReorderPoint > 0 && (
    /*
      A product with a reorder point of 0 can never be LOW, only OUT. That is an
      unanswered question rather than a setting, and after a CSV import it is
      the answer for almost every product — so the number is said out loud
      instead of quietly shrinking this list.
    */
    <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <strong>{noReorderPoint}</strong>{" "}
      {noReorderPoint === 1 ? "product has" : "products have"} no reorder point set, so they
      only appear here once they have run out entirely.{" "}
      <Link href="/catalogue" className="underline">
        Set them in the catalogue
      </Link>
      .
    </p>
  );

  if (rows.length === 0) {
    return (
      <>
        {nudge}
        <Empty>Nothing is at or below its reorder point.</Empty>
      </>
    );
  }

  return (
    <>
      {nudge}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-300">
          {rows.length} product{rows.length === 1 ? "" : "s"} at or below reorder point.
        </p>
        <div className="flex items-center gap-2">
          {canStock && (
            /*
              Straight into the existing purchase-order form with the lines
              already in it. A second way to create a PO would be a second
              place for the numbering and the supplier rules to drift.
            */
            <Link
              href="/purchase-orders/new?prefill=low"
              data-print-hide
              className="rounded-xl brand-gradient px-3.5 py-2 text-sm font-semibold text-white"
            >
              Create PO
            </Link>
          )}
          <ExportCsv
            filename="low-stock.csv"
            header={["Product", "Unit", "On hand", "Reorder point", "Suggested order"]}
            rows={rows.map((r) => [r.name, r.unit, r.onHand, r.reorderPoint, r.suggested])}
          />
        </div>
      </div>

      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full">
          <thead className="bg-white/[0.04]">
            <tr>
              <th className={TH}>Product</th>
              <th className={`${TH} text-right`}>On hand</th>
              <th className={`${TH} text-right`}>Reorder pt</th>
              <th className={`${TH} text-right`}>Suggested order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.productId}>
                <td className={TD}>{r.name}</td>
                <td className={`${TD} text-right tabular-nums ${r.onHand === 0 ? "text-rose-300" : "text-amber-300"}`}>
                  {r.onHand} {r.unit}
                </td>
                <td className={`${TD} text-right tabular-nums text-slate-300`}>{r.reorderPoint}</td>
                <td className={`${TD} text-right font-semibold tabular-nums`}>{r.suggested}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── EXPIRING ───────────────────────────────────────────────────────────── */

const BUCKETS: ExpiryBucket[] = ["expired", "d30", "d60", "d90"];

function Expiring({
  rows,
  bucket,
  windowDays,
  canStock,
  showMoney,
}: {
  rows: ExpiringRow[];
  bucket: string | undefined;
  windowDays: number;
  canStock: boolean;
  showMoney: boolean;
}) {
  const active = (BUCKETS as string[]).includes(bucket ?? "") ? (bucket as ExpiryBucket) : null;
  const shown = active ? rows.filter((r) => r.bucket === active) : rows;
  const tally = (b: ExpiryBucket) => rows.filter((r) => r.bucket === b).length;

  return (
    <>
      {canStock && <AlertWindow days={windowDays} />}

      {/*
        The tiles are FILTERS, not decoration. A count nobody can click is a
        number that sends somebody back to scroll the list looking for it.
      */}
      <div data-print-hide className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile href="/alerts?tab=expiring" label="All" value={rows.length} active={active === null} tone="plain" />
        {BUCKETS.map((b) => (
          <Tile
            key={b}
            href={`/alerts?tab=expiring&bucket=${b}`}
            label={BUCKET_LABEL[b]}
            value={tally(b)}
            active={active === b}
            tone={b === "expired" ? "red" : b === "d30" ? "orange" : b === "d60" ? "amber" : "plain"}
          />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-300">
          Showing <strong className="text-white">{active ? BUCKET_LABEL[active] : "All"}</strong> —{" "}
          {shown.length} batch{shown.length === 1 ? "" : "es"}.
          {showMoney && shown.length > 0 && (
            <> Worth {peso(shown.reduce((s, r) => s + r.valueCentavos, 0))}.</>
          )}
        </p>
        <div className="flex items-center gap-2">
          <PrintButton />
          <ExportCsv
            filename="expiring-stock.csv"
            header={["Product", "Supplier", "Batch", "Expiry", "Status", "Quantity", "Unit"]}
            rows={shown.map((r) => [
              r.productName,
              r.supplierName,
              r.lotNumber,
              manilaExpiry(r.expiryDate),
              BUCKET_LABEL[r.bucket],
              r.quantity,
              r.unit,
            ])}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty>Nothing in this window.</Empty>
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full">
            <thead className="bg-white/[0.04]">
              <tr>
                <th className={TH}>Product</th>
                <th className={TH}>Supplier</th>
                <th className={TH}>Batch</th>
                <th className={TH}>Expiry</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Qty</th>
                {canStock && <th className={TH} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {shown.map((r) => (
                <tr key={r.batchId}>
                  <td className={TD}>{r.productName}</td>
                  <td className={`${TD} text-slate-400`}>{r.supplierName ?? "—"}</td>
                  <td className={`${TD} font-mono text-xs text-slate-300`}>{r.lotNumber ?? "—"}</td>
                  <td className={`${TD} tabular-nums text-slate-300`}>{manilaExpiry(r.expiryDate)}</td>
                  <td className={TD}>
                    <Badge bucket={r.bucket} days={r.days} />
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {r.quantity} {r.unit}
                  </td>
                  {canStock && (
                    <td className={`${TD} text-right`}>
                      <WriteOffButton
                        batchId={r.batchId}
                        quantity={r.quantity}
                        productName={r.productName}
                        unit={r.unit}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Badge({ bucket, days }: { bucket: ExpiryBucket; days: number }) {
  const tone =
    bucket === "expired"
      ? "border-rose-500/40 bg-rose-500/15 text-rose-200"
      : bucket === "d30"
        ? "border-orange-500/40 bg-orange-500/15 text-orange-200"
        : bucket === "d60"
          ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
          : "border-white/15 bg-white/10 text-slate-300";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${tone}`}>
      {bucket === "expired" ? "Expired" : `${days}d`}
    </span>
  );
}

function Tile({
  href,
  label,
  value,
  active,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  active: boolean;
  tone: "red" | "orange" | "amber" | "plain";
}) {
  const colour =
    tone === "red"
      ? "text-rose-300"
      : tone === "orange"
        ? "text-orange-300"
        : tone === "amber"
          ? "text-amber-300"
          : "text-white";
  return (
    <Link
      href={href}
      className={`rounded-2xl border p-4 transition ${
        active ? "border-violet-400/60 bg-violet-500/10" : "border-white/10 bg-white/[0.04] hover:border-white/25"
      }`}
    >
      <p className={`text-3xl font-bold tabular-nums ${colour}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{label}</p>
    </Link>
  );
}

/* ── DEAD STOCK ─────────────────────────────────────────────────────────── */

function DeadStock({
  rows,
  days,
  showMoney,
}: {
  rows: { productId: string; name: string; unit: string; onHand: number; lastSold: Date | null; valueCentavos: number }[];
  days: number;
  showMoney: boolean;
}) {
  if (rows.length === 0) {
    return <Empty>Everything on the shelf has sold within {days} days.</Empty>;
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {showMoney ? (
          <TiedUp count={rows.length} centavos={rows.reduce((s, r) => s + r.valueCentavos, 0)} />
        ) : (
          <p className="text-sm text-slate-300">
            {rows.length} item{rows.length === 1 ? "" : "s"} with no sale in {days} days.
          </p>
        )}
        <div className="flex items-center gap-2">
          <PrintButton />
          <ExportCsv
            filename="dead-stock.csv"
            header={["Product", "Unit", "On hand", "Last sold", ...(showMoney ? ["Value"] : [])]}
            rows={rows.map((r) => [
              r.name,
              r.unit,
              r.onHand,
              r.lastSold ? manilaDate(r.lastSold) : "Never sold",
              ...(showMoney ? [(r.valueCentavos / 100).toFixed(2)] : []),
            ])}
          />
        </div>
      </div>

      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full">
          <thead className="bg-white/[0.04]">
            <tr>
              <th className={TH}>Product</th>
              <th className={`${TH} text-right`}>On hand</th>
              <th className={TH}>Last sold</th>
              {showMoney && <th className={`${TH} text-right`}>Value</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.productId}>
                <td className={TD}>{r.name}</td>
                <td className={`${TD} text-right tabular-nums`}>
                  {r.onHand} {r.unit}
                </td>
                <td className={`${TD} text-slate-400`}>
                  {/* "Never sold" is a different fact from an old date, and the
                      one that says buy less of it next time. */}
                  {r.lastSold ? manilaDate(r.lastSold) : "Never sold"}
                </td>
                {showMoney && (
                  <td className={`${TD} text-right tabular-nums`}>{peso(r.valueCentavos)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── SLOW-MOVING ────────────────────────────────────────────────────────── */

function SlowMoving({
  rows,
  showMoney,
}: {
  rows: {
    productId: string;
    name: string;
    unit: string;
    onHand: number;
    sold: number;
    daysOfSupply: number | null;
    lastSold: Date | null;
    valueCentavos: number;
  }[];
  showMoney: boolean;
}) {
  if (rows.length === 0) {
    return <Empty>Nothing is sitting on more than six months of supply.</Empty>;
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {showMoney ? (
          <TiedUp count={rows.length} centavos={rows.reduce((s, r) => s + r.valueCentavos, 0)} />
        ) : (
          <p className="text-sm text-slate-300">
            {rows.length} item{rows.length === 1 ? "" : "s"} moving slower than six months of supply.
          </p>
        )}
        <div className="flex items-center gap-2">
          <PrintButton />
          <ExportCsv
            filename="slow-moving.csv"
            header={["Product", "Unit", "On hand", "Sold (90d)", "Days of supply", "Last sold"]}
            rows={rows.map((r) => [
              r.name,
              r.unit,
              r.onHand,
              r.sold,
              r.daysOfSupply ?? "",
              r.lastSold ? manilaDate(r.lastSold) : "Never sold",
            ])}
          />
        </div>
      </div>

      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full">
          <thead className="bg-white/[0.04]">
            <tr>
              <th className={TH}>Product</th>
              <th className={`${TH} text-right`}>On hand</th>
              <th className={`${TH} text-right`}>Sold (90d)</th>
              <th className={`${TH} text-right`}>Days of supply</th>
              <th className={TH}>Last sold</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.productId}>
                <td className={TD}>{r.name}</td>
                <td className={`${TD} text-right tabular-nums`}>
                  {r.onHand} {r.unit}
                </td>
                <td className={`${TD} text-right tabular-nums text-slate-300`}>{r.sold}</td>
                <td className={`${TD} text-right font-semibold tabular-nums text-amber-300`}>
                  {r.daysOfSupply === null ? "—" : `${r.daysOfSupply}d`}
                </td>
                <td className={`${TD} text-slate-400`}>
                  {r.lastSold ? manilaDate(r.lastSold) : "Never sold"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
