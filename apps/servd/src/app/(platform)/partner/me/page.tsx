import Link from "next/link";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { PortalShell } from "@/components/partner/PortalShell";
import { MyProfileForm } from "@/components/partner/MyProfileForm";
import { getStaffProfile, getStaffBook } from "@/server/partners/staff";
import { manilaDate } from "@/lib/time/manila";

export const metadata = { title: "My profile" };

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  ops_manager: "Ops manager",
  sales: "Field agent",
  support: "Support",
};

/**
 * A SEAT'S OWN PAGE.
 *
 * REPORTED — "for a field agent account, I should have my profile as well, and
 * all the merchants that I activated will be supported by the agent who
 * created it."
 *
 * Everything needed for this already existed and was reachable by exactly one
 * kind of person: `/partner/team/staff/[id]` shows a seat's record and their
 * book, behind `team.manage`. So a field agent could be looked AT and could not
 * look at themselves — including at the mobile number their own merchants are
 * told to ring.
 *
 * `overview.view` is the gate — the key every working seat holds by default.
 * The first draft used the bare session, and tests/partners/permissions.test.ts
 * refused it: every /partner page gates on a capability, with one named
 * exception, and "everybody has this one anyway" is exactly the argument that
 * puts a page outside the rule and then quietly outside the audit of it.
 *
 * THE EMERGENCY CONTACT IS THEIRS TO READ. `getStaffProfile` withholds it from
 * anybody without `hr.view_all` — by not selecting the columns at all, not by
 * hiding them in a render — and that rule is about other people's records. On
 * your own it is simply your own.
 */
export default async function MyProfilePage() {
  const partner = await requirePartnerPageWith("overview.view");

  // A legacy login IS the partner account: one Supabase user, no seat row, so
  // there is no staff record to show. Said plainly rather than 404ing.
  if (!partner.user.id) {
    return (
      <PortalShell partner={partner} title="My profile">
        <p className="rounded-tile border border-brand-ink/10 bg-white p-5 text-sm text-brand-ink/60">
          This login is the partner account itself rather than a staff seat, so it has no personal
          profile. Your operator&rsquo;s details are under{" "}
          <Link href="/partner/settings" className="font-semibold text-brand-primary">
            Settings
          </Link>
          .
        </p>
      </PortalShell>
    );
  }

  const seatId = partner.user.id;
  const [profile, book] = await Promise.all([
    getStaffProfile(partner.id, seatId, { includeEmergency: true }),
    getStaffBook(partner.id, seatId),
  ]);

  if (!profile) {
    return (
      <PortalShell partner={partner} title="My profile">
        <p className="rounded-tile border border-brand-ink/10 bg-white p-5 text-sm text-brand-ink/60">
          Your staff record could not be loaded. Ask an admin at {partner.name} to check it.
        </p>
      </PortalShell>
    );
  }

  const signed = book.merchants.filter((m) => m.as === "sales");
  const supporting = book.merchants.filter((m) => m.as === "support");

  return (
    <PortalShell
      partner={partner}
      title="My profile"
      subtitle={`${ROLE_LABEL[profile.role] ?? profile.role} at ${partner.name}`}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Signed by me", value: String(signed.length) },
          { label: "I support", value: String(supporting.length) },
          {
            label: "With this team since",
            value: profile.startDate ? manilaDate(profile.startDate) : "—",
          },
        ].map((f) => (
          <div key={f.label} className="rounded-tile border border-brand-ink/10 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/45">
              {f.label}
            </p>
            <p className="mt-1 font-heading text-xl font-bold">{f.value}</p>
          </div>
        ))}
      </div>

      {/*
        NOT EDITABLE HERE, and shown anyway. Somebody looking at their own page
        should be able to read their own sign-in address and what their seat is
        allowed to do; what they must not be able to do is change either from a
        self-service form.
      */}
      <div className="mt-4 rounded-tile border border-brand-ink/10 bg-white p-5 text-sm">
        <p className="text-brand-ink/60">
          You sign in as <span className="font-semibold text-brand-ink">{profile.email}</span> ·{" "}
          {ROLE_LABEL[profile.role] ?? profile.role}
          {profile.zone ? ` · ${profile.zone}` : ""}
        </p>
        <p className="mt-1 text-xs text-brand-ink/45">
          Your role and your email are set by an admin at {partner.name}.
        </p>
      </div>

      <h2 className="mt-8 mb-2 font-heading text-lg font-bold">Your details</h2>
      <MyProfileForm
        name={profile.name ?? ""}
        mobile={profile.mobile}
        emergencyName={profile.emergency?.name ?? null}
        emergencyMobile={profile.emergency?.mobile ?? null}
      />

      <h2 className="mt-8 mb-2 font-heading text-lg font-bold">
        Accounts you signed{signed.length > 0 ? ` (${signed.length})` : ""}
      </h2>
      {signed.length === 0 ? (
        <p className="rounded-tile border border-dashed border-brand-ink/15 bg-white p-6 text-sm text-brand-ink/55">
          None yet. Every merchant you open is assigned to you automatically — you are who that
          shop rings when something breaks.
        </p>
      ) : (
        <MerchantList rows={signed} />
      )}

      {supporting.length > 0 && (
        <>
          <h2 className="mt-8 mb-2 font-heading text-lg font-bold">
            Accounts you support ({supporting.length})
          </h2>
          <MerchantList rows={supporting} />
        </>
      )}
    </PortalShell>
  );
}

function MerchantList({ rows }: { rows: { key: string; name: string; productName: string; status: string }[] }) {
  return (
    <ul className="divide-y divide-brand-ink/[0.06] overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
      {rows.map((m) => (
        <li key={m.key}>
          <Link
            href={`/partner/merchants/${m.key}`}
            className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-brand-surface"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">{m.name}</span>
              <span className="block text-xs text-brand-ink/45">{m.productName}</span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase ${
                m.status === "active"
                  ? "bg-brand-primary/12 text-brand-primary"
                  : "bg-brand-ink/5 text-brand-ink/50"
              }`}
            >
              {m.status}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
