import Link from "next/link";
import { CanvexiaLockup } from "@/components/partner/CanvexiaBrand";
import { ApplyPartnerForm } from "@/components/partner/ApplyPartnerForm";

export default function PartnerApplyPage() {
  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <CanvexiaLockup size={30} />
      <h1 className="mt-8 font-heading text-3xl font-extrabold">Become a CANVEXIA partner</h1>
      <p className="mt-2 text-brand-ink/65">
        One partner per city. You sign up local businesses under your own brand and keep
        70% of what they pay every month. Apply below — we&apos;ll review and send your
        login once approved.
      </p>
      <div className="mt-6">
        <ApplyPartnerForm />
      </div>
      <p className="mt-4 text-center text-sm text-brand-ink/50">
        Already a partner? <Link href="/partner/login" className="font-semibold text-brand-primary">Log in</Link>
      </p>
    </div>
  );
}
