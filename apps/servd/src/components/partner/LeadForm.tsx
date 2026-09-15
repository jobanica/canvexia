"use client";

import { useActionState } from "react";
import { submitLeadAction, type LeadState } from "@/server/partners/prospect-actions";

const initial: LeadState = { status: "idle" };

/**
 * The public lead form.
 *
 * The slug is a hidden field because the page is public and has no session —
 * but it is a LOOKUP KEY, not an identity. The server resolves it to a partner
 * and `LeadInput` has no `partnerId` field at all, so a crafted POST cannot
 * name someone else's pipeline. Worth knowing when reading this: the hidden
 * input is not the trust boundary; the schema is.
 */
export function LeadForm({
  slug,
  partnerName,
  products,
}: {
  slug: string;
  partnerName: string;
  products: { id: string; name: string; description: string }[];
}) {
  const [state, action, pending] = useActionState(submitLeadAction, initial);
  const field =
    "min-h-[48px] w-full rounded-lg border border-brand-ink/15 bg-white px-3 text-base outline-none focus:border-brand-ink";

  if (state.status === "done") {
    return (
      <div className="rounded-tile border border-brand-ink/10 bg-white p-8">
        <h2 className="font-heading text-2xl font-bold">Thanks — we have it.</h2>
        <p className="mt-3 text-brand-ink/65">
          {partnerName} will call you on the number you gave. Nothing is owed and nothing is
          booked yet.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-tile border border-brand-ink/10 bg-white p-6">
      <input type="hidden" name="slug" value={slug} />

      <div className="grid gap-4">
        <label>
          <span className="text-sm font-semibold">Business name</span>
          <input name="businessName" required maxLength={160} className={`${field} mt-1.5`} />
        </label>

        <label>
          <span className="text-sm font-semibold">Your name</span>
          <input
            name="ownerName"
            required
            maxLength={120}
            autoComplete="name"
            className={`${field} mt-1.5`}
          />
        </label>

        <label>
          <span className="text-sm font-semibold">Mobile</span>
          <input
            name="mobile"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="0917 123 4567"
            className={`${field} mt-1.5`}
          />
          <span className="mt-1 block text-xs text-brand-ink/45">
            This is how we reach you. No spam.
          </span>
        </label>

        <label>
          <span className="text-sm font-semibold">What kind of business?</span>
          <select name="productId" required defaultValue="" className={`${field} mt-1.5`}>
            <option value="" disabled>
              Choose one
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.description}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="text-sm font-semibold">
            Address <span className="font-normal text-brand-ink/45">(optional)</span>
          </span>
          <input name="address" maxLength={200} className={`${field} mt-1.5`} />
        </label>

        <label>
          <span className="text-sm font-semibold">
            Anything else? <span className="font-normal text-brand-ink/45">(optional)</span>
          </span>
          <textarea
            name="message"
            rows={3}
            maxLength={500}
            className="mt-1.5 w-full rounded-lg border border-brand-ink/15 bg-white p-3 text-base outline-none focus:border-brand-ink"
          />
        </label>
      </div>

      {state.status === "error" && (
        <p role="alert" className="mt-4 rounded-lg bg-guava/10 px-3 py-2 text-sm text-guava">
          {state.message}
        </p>
      )}

      <button
        disabled={pending}
        className="mt-5 min-h-[52px] w-full rounded-full bg-brand-ink px-6 text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send"}
      </button>

      <p className="mt-3 text-xs leading-relaxed text-brand-ink/45">
        We use your details to contact you about software for your business, and nothing
        else.
      </p>
    </form>
  );
}
