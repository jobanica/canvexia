"use client";

import { useActionState, useEffect, useState, useTransition } from "react";

import { addClient, autofillFromFacebook, type CrmActionState } from "@/server/crm/actions";

/**
 * Add a CRM client. Paste a Facebook page URL and "Autofill" to pre-fill the
 * business name / email / phone / address (best-effort scrape of the public
 * page) — then review and save. Inputs are controlled so autofill can populate
 * them; they still submit via the form action.
 */
export function AddClientForm({ onAdded }: { onAdded?: () => void }) {
  const [state, action] = useActionState<CrmActionState, FormData>(addClient, null);
  const [name, setName] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [filling, startFill] = useTransition();
  const [fillMsg, setFillMsg] = useState<string | null>(null);

  // Clear the form after a successful add.
  useEffect(() => {
    if (state?.ok) {
      setName("");
      setFacebookUrl("");
      setContactName("");
      setPhone("");
      setEmail("");
      setAddress("");
      setNotes("");
      setFillMsg(null);
      onAdded?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function autofill() {
    const url = facebookUrl.trim();
    if (!url) return;
    setFillMsg(null);
    startFill(async () => {
      const res = await autofillFromFacebook(url);
      if ("error" in res) {
        setFillMsg(res.error);
        return;
      }
      if (res.name) setName(res.name);
      if (res.email) setEmail(res.email);
      if (res.phone) setPhone(res.phone);
      if (res.address) setAddress(res.address);
      if (res.website && !notes) setNotes(`Website: ${res.website}`);
      const got = [
        res.name && "name",
        res.phone && "phone",
        res.email && "email",
        res.address && "address",
      ].filter(Boolean);
      setFillMsg(
        got.length
          ? `Filled: ${got.join(", ")}. Review & edit, then add.`
          : "Couldn't read details from that page — please fill in manually.",
      );
    });
  }

  const field = "rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

  return (
    <form action={action} className="grid gap-2 rounded-tile border border-plum-ink/10 bg-white p-3 sm:grid-cols-2">
      {/* Facebook URL + autofill */}
      <div className="flex gap-2 sm:col-span-2">
        <input
          name="facebookUrl"
          value={facebookUrl}
          onChange={(e) => setFacebookUrl(e.target.value)}
          placeholder="Facebook page URL — e.g. facebook.com/TheirRestaurant"
          className={`flex-1 ${field}`}
        />
        <button
          type="button"
          onClick={autofill}
          disabled={filling || !facebookUrl.trim()}
          className="whitespace-nowrap rounded-lg bg-[#1877f2] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {filling ? "Reading…" : "✨ Autofill"}
        </button>
      </div>
      {fillMsg && <p className="sm:col-span-2 text-xs text-plum-ink/60">{fillMsg}</p>}

      <input name="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Business name *" className={field} />
      <input name="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name (optional)" className={field} />
      <input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={field} />
      <input name="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={field} />
      <input name="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" className={`sm:col-span-2 ${field}`} />
      <textarea name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" className={`sm:col-span-2 ${field}`} />

      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-white">Add client</button>
        {state?.error && <span className="text-sm text-guava">{state.error}</span>}
      </div>
    </form>
  );
}
