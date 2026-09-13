import Link from "next/link";
import { redirect } from "next/navigation";
import { AppIcon, Wordmark } from "@/components/Wordmark";
import { PartnerLoginForm } from "@/components/partner/PartnerLoginForm";
import { getCurrentPartner } from "@/server/partners/auth";

export default async function PartnerLoginPage() {
  if (await getCurrentPartner()) redirect("/partner");
  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <Link href="/" className="flex items-center gap-2">
        <AppIcon size={30} />
        <Wordmark size="1.3rem" />
      </Link>
      <h1 className="mt-8 font-heading text-2xl font-bold">Partner login</h1>
      <p className="mt-1 text-sm text-plum-ink/55">
        Build previews and set up the restaurants you&apos;ve signed.
      </p>
      <div className="mt-6">
        <PartnerLoginForm />
      </div>
      <p className="mt-4 text-center text-sm text-plum-ink/50">
        New partner? <Link href="/partner/apply" className="font-semibold text-brand-primary">Apply here</Link>
      </p>
    </div>
  );
}
