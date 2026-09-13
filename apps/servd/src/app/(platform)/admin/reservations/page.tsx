import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import {
  listReservations,
  setReservationStatus,
  assignReservationTable,
  type ReservationRow,
} from "@/server/reservations/reservations";
import { getTables } from "@/server/tables/queries";
import { ReservationForm } from "@/components/admin/ReservationForm";

function when(d: Date | null): string {
  if (!d) return "Walk-in";
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function ReservationsPage() {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "reservations", "Reservations");
  if (locked) return locked;
  const [rows, tables] = await Promise.all([listReservations(restaurantId), getTables(restaurantId)]);

  const waitlist = rows.filter((r) => r.status === "waitlisted");
  const booked = rows.filter((r) => r.status !== "waitlisted");

  function Row({ r }: { r: ReservationRow }) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-tile border border-plum-ink/10 bg-white p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-heading font-bold">{r.customerName}</span>
            <span className="rounded-full bg-plum-ink/5 px-2 py-0.5 text-xs text-plum-ink/60">{r.partySize} pax</span>
            {r.source === "online" && (
              <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs font-semibold text-brand-primary">🌐 Online</span>
            )}
            {r.status === "seated" && (
              <span className="rounded-full bg-mango/15 px-2 py-0.5 text-xs font-semibold text-mango">Seated</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-plum-ink/55">
            {when(r.reservedAt)}
            {r.customerPhone ? ` · ${r.customerPhone}` : ""}
            {r.note ? ` · ${r.note}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={assignReservationTable} className="flex items-center gap-1">
            <input type="hidden" name="id" value={r.id} />
            <select name="tableId" defaultValue={r.tableId ?? ""} className="rounded-lg border border-plum-ink/15 px-2 py-1.5 text-xs">
              <option value="">No table</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  Table {t.tableNumber}
                </option>
              ))}
            </select>
            <button className="rounded-lg border border-plum-ink/15 px-2.5 py-1.5 text-xs font-semibold">Set</button>
          </form>
          {r.status !== "seated" && (
            <form action={setReservationStatus}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="status" value="seated" />
              <button className="rounded-lg bg-brand-primary px-2.5 py-1.5 text-xs font-semibold text-white">Seat</button>
            </form>
          )}
          <form action={setReservationStatus}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="status" value="no_show" />
            <button className="rounded-lg border border-plum-ink/15 px-2.5 py-1.5 text-xs font-semibold">No-show</button>
          </form>
          <form action={setReservationStatus}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="status" value="cancelled" />
            <button className="text-xs text-muted hover:text-guava">Cancel</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Reservations &amp; waitlist</h1>
        <p className="text-sm text-plum-ink/50">
          Book tables ahead or seat walk-ins from the waitlist. Assigning a table marks it reserved on
          the floor plan.
        </p>
      </div>

      <ReservationForm tables={tables.map((t) => ({ id: t.id, tableNumber: t.tableNumber }))} />

      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Upcoming reservations</h2>
        <div className="space-y-3">
          {booked.length === 0 ? (
            <p className="text-sm text-plum-ink/50">No reservations yet.</p>
          ) : (
            booked.map((r) => <Row key={r.id} r={r} />)
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Waitlist</h2>
        <div className="space-y-3">
          {waitlist.length === 0 ? (
            <p className="text-sm text-plum-ink/50">Nobody waiting.</p>
          ) : (
            waitlist.map((r) => <Row key={r.id} r={r} />)
          )}
        </div>
      </div>
    </div>
  );
}
