import Link from "next/link";
import { AppIcon, Wordmark } from "@/components/Wordmark";
import { ApplyPartnerForm } from "@/components/partner/ApplyPartnerForm";

export default function PartnerApplyPage() {
  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <Link href="/" className="flex items-center gap-2">
        <AppIcon size={30} />
        <Wordmark size="1.3rem" />
      </Link>
      <h1 className="mt-8 font-heading text-3xl font-extrabold">Become a Servd partner</h1>
      <p className="mt-2 text-plum-ink/65">
        Set restaurants up on Servd and charge them what you decide — no commission split and
        no cap on accounts. Apply below — we&apos;ll review and send your login once approved.
      </p>
      <div className="mt-6">
        <ApplyPartnerForm />
      </div>
      <p className="mt-4 text-center text-sm text-plum-ink/50">
        Already a partner? <Link href="/partner/login" className="font-semibold text-brand-primary">Log in</Link>
      </p>
    </div>
  );
}
