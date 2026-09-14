"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchPharmacy } from "@/server/tenancy/switch-actions";
import { ROLE_LABEL, type PharmacyRole } from "@/lib/pharmacy/roles";

/**
 * For the owner with two branches, or the relief pharmacist covering both.
 *
 * Writes a cookie and refreshes; it does NOT carry the pharmacy id into the
 * pages. The server re-reads the memberships and checks the cookie against them
 * on every request, so choosing a pharmacy here is a request, not an
 * instruction — picking one you are not staff at does nothing.
 */
export function PharmacySwitcher({
  memberships,
  current,
}: {
  memberships: { pharmacyId: string; name: string; role: PharmacyRole }[];
  current: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={current}
      disabled={pending}
      onChange={(e) => {
        const id = e.target.value;
        startTransition(async () => {
          await switchPharmacy(id);
          router.refresh();
        });
      }}
      aria-label="Pharmacy"
      className="rounded border border-slate-300 bg-white px-2 py-1 text-sm disabled:opacity-50"
    >
      {memberships.map((m) => (
        <option key={m.pharmacyId} value={m.pharmacyId}>
          {m.name} · {ROLE_LABEL[m.role]}
        </option>
      ))}
    </select>
  );
}
