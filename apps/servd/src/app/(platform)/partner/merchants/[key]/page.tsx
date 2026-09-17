import Link from "next/link";
import { notFound } from "next/navigation";
import { partnerAllows, partnerCan, requirePartnerPageWith } from "@/server/partners/auth";
import { getPartnerMerchant, merchantAssignees, isPaying } from "@/server/partners/merchants";
import { pharmacyActivation } from "@/server/partners/pharmacies";
import { PharmacyActivate } from "@/components/partner/PharmacyActivate";
import { demoLogin } from "@/server/partners/demo-queries";
import { PortalShell } from "@/components/partner/PortalShell";
import { PartnerConvertForm } from "@/components/partner/PartnerConvertForm";
import { MerchantPasswordReset } from "@/components/partner/MerchantPasswordReset";
import { MerchantSuspend } from "@/components/partner/MerchantSuspend";
import { peso } from "@/components/partner/Overview";

/**
 * One merchant.
 *
 * The key is `productId:id` because a merchant id is unique only WITHIN a
 * product (D29) — `/merchants/abc123` would be ambiguous the moment two
 * products both have an abc123, and ambiguous in a way that returns the wrong
 * shop rather than nothing.
 *
 * `getPartnerMerchant` reads through partnerDb, so a key belonging to another
 * partner resolves to null and this page 404s. It answers "not found" rather
 * than "not yours" on purpose: probing ids should not be a directory.
 */
export default async function PartnerMerchantPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const partner = await requirePartnerPageWith("merchants.read");
  const { key } = await params;
  const merchant = await getPartnerMerchant(partner.id, decodeURIComponent(key));
  if (!merchant) notFound();

  const assignees = await merchantAssignees(partner.id, merchant.productId, merchant.id);
  // Only a pharmacy has one. Null for everything else, and the section below
  // renders nothing.
  const pharmacy =
    merchant.productId === "pharmacy"
      ? await pharmacyActivation(partner.id, merchant.id)
      : null;

  /**
   * THE LOGIN, and the step that creates one.
   *
   * An account opened from the portal has NO login: provisioning makes the
   * tenant, the storefront and the complimentary trial, and stops there,
   * because at that point the owner has not agreed to anything. "Convert" is
   * what mints the credential — and it lived only in the storefronts list on
   * the operator overview, a page a sales seat never sees. So a field agent
   * could open an account and not finish the sale: they had nowhere to get the
   * owner a username and password.
   *
   * Here instead, on the merchant itself, which is where somebody looks when
   * they are asking "how does this shop get in?".
   */
  const login = merchant.productId === "servd" ? await demoLogin(merchant.id) : null;
  // `merchants.create` is the same capability convertPartnerDemo checks, so the
  // form is shown to exactly the seats the server will accept.
  const canConvert = partnerCan(partner, "merchants.create");

  const facts = [
    { label: "Product", value: merchant.productName },
    { label: "Plan", value: merchant.planName ?? "Not billed yet" },
    {
      label: "Monthly price",
      value: merchant.priceMonthly === null ? "—" : peso(merchant.priceMonthly),
    },
    { label: "Status", value: merchant.status },
    { label: "Orders, last 30 days", value: String(merchant.ordersLast30d) },
    {
      label: "Last order",
      value: merchant.lastOrderAt ? merchant.lastOrderAt.toLocaleDateString() : "Never",
    },
    { label: "Opened", value: merchant.createdAt.toLocaleDateString() },
    // The handle the owner signs in with. "No login yet" is a real state, not a
    // missing value, so it says so rather than showing a dash.
    ...(login
      ? [{ label: "Login", value: login.converted ? (login.username ?? "Set up") : "No login yet" }]
      : []),
    { label: "Address", value: merchant.city ?? "—" },
  ];

  return (
    <PortalShell
      partner={partner}
      title={merchant.name}
      subtitle={`${merchant.productName} · /${merchant.slug}`}
    >
        <Link href="/partner/merchants" className="text-sm text-brand-ink/50 hover:text-brand-ink">
          ← All merchants
        </Link>

        {merchant.subscriptionStatus === "past_due" && (
          <p className="mt-4 rounded-lg bg-guava/10 px-4 py-3 text-sm text-guava">
            This account is past due. A failed payment stops nothing on its own — the account
            keeps working until HQ suspends it — but it is not earning either of you anything.
          </p>
        )}

        <dl className="mt-6 grid gap-px overflow-hidden rounded-tile bg-brand-ink/10 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label} className="bg-white p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-brand-ink/45">
                {f.label}
              </dt>
              <dd className="mt-1 text-sm font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>

        {/*
          WHO TO CALL.

          REPORTED — "so partner can see who activated it and if have problem,
          knows who to call." These two names were already on the page, in the
          facts grid, and always read "Nobody yet": the columns are READ in five
          places — commissions, the scorecard, the staff screen, reassignment —
          and were written by none of them at the moment a merchant was opened.
          Stamping the creator is the other half of this change.

          A name alone answers half the question. An operator reading "Signed by
          Juan" at 8pm with a broken till still has to go and look Juan up, so
          the number is here and it dials.
        */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["Signed by", assignees.signedBy],
              ["Supported by", assignees.supportedBy],
            ] as const
          ).map(([label, who]) => (
            <div key={label} className="rounded-tile border border-brand-ink/10 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/45">
                {label}
              </p>
              {who ? (
                <>
                  <p className="mt-1 text-sm font-semibold">
                    {who.name}
                    {/* Still named, and marked. The person who signed it is a
                        historical fact; ringing a number that has left the
                        company is not. */}
                    {!who.active && (
                      <span className="ml-2 rounded-full bg-brand-ink/8 px-2 py-0.5 text-[0.65rem] font-semibold uppercase text-brand-ink/50">
                        Left
                      </span>
                    )}
                  </p>
                  {who.mobile ? (
                    <a
                      href={`tel:${who.mobile.replace(/\s+/g, "")}`}
                      className="mt-0.5 block text-sm font-semibold text-brand-primary"
                    >
                      {who.mobile}
                    </a>
                  ) : (
                    // Said, not left blank. A missing number is something the
                    // seat can fix on their own profile.
                    <p className="mt-0.5 text-xs text-brand-ink/45">
                      No mobile on their profile yet.
                    </p>
                  )}
                  <p className="text-xs text-brand-ink/45">{who.email}</p>
                </>
              ) : (
                // "Nobody yet" rather than an em dash: an unassigned merchant
                // is a thing to fix, and a dash reads as "not applicable".
                <p className="mt-1 text-sm text-brand-ink/50">Nobody yet</p>
              )}
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-brand-ink/55">
          {isPaying(merchant)
            ? `Earning you ${peso(Math.floor(((merchant.priceMonthly ?? 0) * partner.revenueSharePct) / 100))} a month at your ${partner.revenueSharePct}% share.`
            : "Not paying yet, so it is not earning either of you anything."}
        </p>

        {/*
          THE LAST STEP, on the account it belongs to.

          REPORTED — "I tried to create a merchant for Resceta, but I don't know
          where to activate it." The control lived on the partner-wide overview
          and only there, and /partner forks before it: a seat without
          `merchants.view_all` gets "My day" instead. So the agent who opened the
          pharmacy could not reach the one button that makes it usable.

          `merchants.create` is what the action checks, so it is what decides
          whether the button renders — the seat that may open the account may
          finish opening it. The STATE renders for anybody who can see the
          merchant, because "this cannot dispense yet" is a fact about the
          account, not a capability to hide.
        */}
        {pharmacy && (
          <PharmacyActivate
            merchantId={merchant.id}
            status={pharmacy.status}
            hasLto={pharmacy.hasLto}
            activation={pharmacy.activation}
            canActivate={partnerCan(partner, "merchants.create")}
          />
        )}

        {/*
          Handing the owner their login. The one action that is built, and the
          one a salesperson needs on the day they close: it turns an account
          nobody can sign into (which is how every partner-opened account
          starts) into the owner's own.

          The credentials are shown ONCE, in the form's success state, because
          the password only exists in that response. Standing in front of the
          owner is the moment to read them out.
        */}
        {login && canConvert && (
          <div className="mt-8">
            {!login.converted && (
              <>
                <p className="mb-2 text-sm font-semibold">Nobody can sign in to this yet</p>
                <p className="mb-3 text-sm text-brand-ink/55">
                  Opening the account set up the shop, its page and its QR codes — not a
                  login, because at that point nobody had agreed to anything. Give it one
                  when they say yes.
                </p>
              </>
            )}
            {/*
              RENDERED WHETHER OR NOT IT IS CONVERTED, and that is the fix for a
              real bug rather than a stylistic choice. A server action re-renders
              this page when it finishes, so `{!login.converted && <form/>}` tore
              the component out at the exact moment it had the password to show —
              `converted` had just become true. It was displayed for no frames,
              and the account was left with a credential nobody had.

              The component keeps its own state and shows the credentials even
              once the page agrees the conversion happened; it renders nothing
              when it is merely looking at an account somebody else converted.
            */}
            <PartnerConvertForm restaurantId={merchant.id} alreadyConverted={login.converted} />
          </div>
        )}

        {login?.converted && (
          <div className="mt-8 rounded-tile border border-brand-ink/10 bg-white p-5">
            <p className="text-sm text-brand-ink/60">
              The owner signs in as{" "}
              <span className="font-semibold text-brand-ink">
                {login.username ?? "their username"}
              </span>
              . The password is shown once, when it is set, and never again.
            </p>
            {/*
              The way back from "nobody wrote it down". Their login is a
              synthetic address at a domain that receives no mail, so a
              self-service reset from the sign-in page does not reach them —
              which is what made a lost password unrecoverable.
            */}
            {canConvert && <MerchantPasswordReset restaurantId={merchant.id} />}
          </div>
        )}

        {/*
          SUSPENDING IS THE PARTNER'S LEVER, and it exists because nothing
          automatic can pull it. A partner-sold account is billed in cash off
          this system, so Servd never duns it and never switches it off for
          non-payment — it has no idea whether the money arrived. The person who
          does know is reading this page.

          `merchants.suspend`: the A7 permission that names this action, so an
          operator can take it off a seat. Admin and ops_manager hold it by
          default; sales opens accounts and support answers for them.
        */}
        {/*
          RESCETA TOO. This was `productId === "servd"`, which made the lever a
          one-way door for a pharmacy: `activatePharmacy` could switch one on
          and nothing could switch it off. Resceta already honours the flag —
          its counter refuses to ring up a sale when the pharmacy is not active
          — so the mechanism was built and only the control was missing.
        */}
        {partnerAllows(partner, "merchants.suspend") &&
          (merchant.productId === "servd" || merchant.productId === "pharmacy") && (
          <div className="mt-8 rounded-tile border border-brand-ink/10 bg-white p-5">
            <p className="text-sm font-semibold">
              {merchant.status === "suspended" ? "This account is suspended" : "Access"}
            </p>
            <p className="mt-1 text-sm text-brand-ink/55">
              {merchant.status === "suspended"
                ? merchant.productId === "pharmacy"
                  ? "Their counter refuses to ring up a sale and says why. Stock, batches and past receipts are untouched."
                  : "Their staff see a notice instead of the app and the ordering page is closed. Nothing has been deleted."
                : "Everything is switched on. Suspend it if they stop paying you — it is reversible, and nothing is lost."}
            </p>
            <MerchantSuspend
              merchantId={merchant.id}
              productId={merchant.productId}
              suspended={merchant.status === "suspended"}
            />
          </div>
        )}

        {/*
          Still honestly absent: changing a plan, extending a trial, marking an
          invoice paid, and signing in as a merchant. Each writes to another
          tenant's data and each needs its own audit row and confirmation — a
          disabled button that looks like a feature is worse than an honest gap,
          and half an impersonation flow is a security hole with a spinner.
        */}
        <div className="mt-4 rounded-tile border border-dashed border-brand-ink/15 bg-white p-5">
          <p className="text-sm font-semibold">Not built yet</p>
          <p className="mt-1 text-sm text-brand-ink/55">
            Changing a plan, extending a trial, marking an invoice paid and signing in as a
            merchant. They land with their audit trail rather than ahead of it.
          </p>
        </div>
    </PortalShell>
  );
}
