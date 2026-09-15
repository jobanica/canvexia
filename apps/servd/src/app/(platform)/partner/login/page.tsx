import Link from "next/link";
import { redirect } from "next/navigation";
import { CanvexiaLockup } from "@/components/partner/CanvexiaBrand";
import { PartnerLoginForm } from "@/components/partner/PartnerLoginForm";
import { getCurrentPartner } from "@/server/partners/auth";

export default async function PartnerLoginPage() {
  if (await getCurrentPartner()) redirect("/partner");
  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <CanvexiaLockup size={30} />
      <h1 className="mt-8 font-heading text-2xl font-bold">Partner login</h1>
      <p className="mt-1 text-sm text-brand-ink/55">
        Your city, your brand, your merchants.
      </p>
      <div className="mt-6">
        <PartnerLoginForm />
      </div>
      <p className="mt-4 text-center text-sm text-brand-ink/50">
        New partner? <Link href="/partner/apply" className="font-semibold text-brand-primary">Apply here</Link>
      </p>
    </div>
  );
}
