"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CONSENT_LABEL, whyNotSendable, type ConsentStatus } from "@servd/core";
import {
  addContactAction,
  importContactsAction,
  optOutContactAction,
  type ContactState,
} from "@/server/partners/sms-contacts-actions";
import type { ContactRow } from "@/server/partners/sms-contacts";

/**
 * The contact book.
 *
 * NOT SENDABLE ROWS ARE GREYED AND SAY WHY. The brief asks for the reason
 * rather than just the greying, and it is right to: "they opted out" and
 * "nobody has asked them" are different problems — one is final, the other is a
 * conversation somebody could have this afternoon.
 */
export function ContactBook({
  contacts,
  counts,
  search,
  status,
  senderName,
  senderIsOwn,
}: {
  contacts: ContactRow[];
  counts: { opted_in: number; opted_out: number; unknown: number };
  search: string;
  status: ConsentStatus | "all";
  senderName: string;
  senderIsOwn: boolean;
}) {
  const [addState, add, adding] = useActionState<ContactState, FormData>(addContactAction, null);
  const [importState, runImport, importing] = useActionState<ContactState, FormData>(
    importContactsAction,
    null,
  );
  const [outState, optOut] = useActionState<ContactState, FormData>(optOutContactAction, null);
  const field =
    "min-h-[44px] w-full rounded-lg border border-brand-ink/15 bg-white px-3 text-sm outline-none focus:border-brand-ink";

  const tabs: { key: ConsentStatus | "all"; label: string; n?: number }[] = [
    { key: "all", label: "Everyone" },
    { key: "opted_in", label: "Opted in", n: counts.opted_in },
    { key: "unknown", label: "Not asked", n: counts.unknown },
    { key: "opted_out", label: "Opted out", n: counts.opted_out },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/partner/sms/contacts${t.key === "all" ? "" : `?status=${t.key}`}`}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
              status === t.key
                ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                : "border-brand-ink/15 bg-white text-brand-ink/55 hover:bg-brand-surface"
            }`}
          >
            {t.label}
            {typeof t.n === "number" && ` · ${t.n}`}
          </Link>
        ))}
      </div>

      {/* Which name their phone will show. A partner whose own sender name is
          still pending should know their texts go out as CANVEXIA rather than
          find out from a confused contact. */}
      <p className="text-xs text-brand-ink/50">
        Texts go out as <strong className="font-semibold text-brand-ink/70">{senderName}</strong>
        {senderIsOwn
          ? "."
          : " — your own sender name isn't approved by the network yet, so CANVEXIA's is used."}
      </p>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={search}
          placeholder="Search a name, business or number"
          className={field}
        />
        <button className="min-h-[44px] shrink-0 rounded-full border border-brand-ink/15 bg-white px-5 text-sm font-semibold">
          Search
        </button>
      </form>

      <section className="overflow-x-auto rounded-tile border border-brand-ink/10 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-brand-ink/10 text-left text-xs uppercase tracking-wide text-brand-ink/45">
              <th className="px-4 py-3 font-semibold">Who</th>
              <th className="px-4 py-3 font-semibold">Consent</th>
              <th className="px-4 py-3 font-semibold">Evidence</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-ink/[0.07]">
            {contacts.map((c) => {
              const why = whyNotSendable(c.consentStatus);
              return (
                <tr key={c.id} className={why ? "text-brand-ink/40" : undefined}>
                  <td className="px-4 py-3">
                    <span className="block font-semibold">
                      {c.name ?? c.businessName ?? c.mobile}
                    </span>
                    <span className="block text-xs text-brand-ink/45">
                      {c.mobile}
                      {c.businessName && c.name ? ` · ${c.businessName}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        c.consentStatus === "opted_in"
                          ? "font-semibold text-brand-primary"
                          : c.consentStatus === "opted_out"
                            ? "font-semibold text-guava"
                            : undefined
                      }
                    >
                      {CONSENT_LABEL[c.consentStatus]}
                    </span>
                    {why && <span className="block text-xs">{why}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {/* The sentence somebody would be shown if they complain.
                        On the screen rather than buried, because a partner
                        should be able to see what their own records claim. */}
                    {c.consentEvidence ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.consentStatus !== "opted_out" && (
                      <form action={optOut}>
                        <input type="hidden" name="contactId" value={c.id} />
                        <button className="text-xs font-semibold text-guava hover:underline">
                          Opt out
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-sm text-brand-ink/50">
                  Nobody here yet. Your team adds people by asking at a visit, and the
                  enquiry form adds anyone who ticks the box.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {outState?.error && (
        <p role="alert" className="text-sm text-guava">
          {outState.error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <form action={add} className="rounded-tile border border-brand-ink/10 bg-white p-5">
          <p className="text-sm font-semibold">Add someone</p>
          <div className="mt-3 grid gap-3">
            <input name="mobile" required placeholder="0917 123 4567" inputMode="tel" className={field} />
            <input name="name" placeholder="Their name (optional)" className={field} />
            <input name="businessName" placeholder="Business (optional)" className={field} />
            {/* No default. "Did they agree?" has a right answer that only the
                person who asked knows, and a pre-selected one would be a
                record of consent nobody gave. */}
            <select name="consent" required defaultValue="" className={field}>
              <option value="" disabled>
                Did they agree to be texted?
              </option>
              <option value="yes">Yes, they agreed</option>
              <option value="no">No</option>
            </select>
            <button
              disabled={adding}
              className="min-h-[44px] justify-self-start rounded-full bg-brand-ink px-6 text-sm font-semibold text-white disabled:opacity-60"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
          {addState?.error && (
            <p role="alert" className="mt-3 text-sm text-guava">
              {addState.error}
            </p>
          )}
          {addState?.ok && <p className="mt-3 text-sm text-brand-primary">{addState.message}</p>}
        </form>

        <form action={runImport} className="rounded-tile border border-brand-ink/10 bg-white p-5">
          <p className="text-sm font-semibold">Import a list</p>
          <p className="mt-1 text-xs text-brand-ink/55">
            One number per line. Optionally <code>number, name, business</code>.
          </p>
          <textarea
            name="csv"
            rows={5}
            required
            placeholder={"0917 123 4567, Aling Nena, Nena's Carinderia"}
            className="mt-3 w-full rounded-lg border border-brand-ink/15 px-3 py-2 font-mono text-xs"
          />
          {/*
            THE ATTESTATION. A file of numbers carries no consent with it, so
            somebody has to say where it came from in their own words — and
            that sentence is stored against every row it creates and in the
            audit log. This is the one door an unconsented list could walk
            through, and this is the lock on it.
          */}
          <textarea
            name="attestation"
            rows={2}
            required
            placeholder="Where did this consent come from? e.g. Signed forms collected at the Tagum trade fair, March 2026."
            className="mt-3 w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
          />
          <label className="mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              name="attested"
              value="on"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-brand-ink/25"
            />
            <span className="text-xs leading-relaxed text-brand-ink/60">
              I confirm every number on this list agreed to be texted by us, and I
              understand this is recorded against my name.
            </span>
          </label>
          <button
            disabled={importing}
            className="mt-3 min-h-[44px] rounded-full border border-brand-ink/15 px-6 text-sm font-semibold disabled:opacity-60"
          >
            {importing ? "Importing…" : "Import"}
          </button>
          {importState?.error && (
            <p role="alert" className="mt-3 text-sm text-guava">
              {importState.error}
            </p>
          )}
          {importState?.ok && (
            <p className="mt-3 text-sm text-brand-primary">{importState.message}</p>
          )}
        </form>
      </div>
    </div>
  );
}
