import Link from "next/link";
import { redirect } from "next/navigation";
import { CanvexiaLockup } from "@/components/partner/CanvexiaBrand";
import { HqLoginForm } from "@/components/hq/HqLoginForm";
import { getCurrentHqUser } from "@/server/hq/auth";

/**
 * The CANVEXIA HQ console's own front door.
 *
 * NOT Servd's staff login, and the separation is not cosmetic. That form says
 * "Sign in to your restaurant's dashboard" because it signs in restaurant
 * cashiers and kitchen screens, and it routes by staff role. HQ is a different
 * company's console with a different audience — CANVEXIA runs Servd, not the
 * other way round — so pointing HQ at a screen wearing one product's brand
 * would say the wrong thing about which of the two contains the other.
 *
 * `brand-canvexia` pins the colour variables the same way the portal does, so
 * this page is coral and ink wherever it renders.
 */
export default async function HqLoginPage() {
  if (await getCurrentHqUser()) redirect("/hq");

  return (
    <div className="brand-canvexia min-h-screen bg-brand-surface text-brand-ink">
      <div className="mx-auto max-w-sm px-6 py-16">
        <CanvexiaLockup size={30} />

        <h1 className="mt-8 font-heading text-2xl font-bold">HQ console</h1>
        <p className="mt-1 text-sm text-brand-ink/55">
          Partners, territories, merchants and money — across every product.
        </p>

        <div className="mt-6">
          <HqLoginForm />
        </div>

        {/*
          The other two doors, named. Somebody who reaches this page by mistake
          should be able to get where they meant to go without asking, and there
          are exactly three kinds of person who sign into this deployment.
        */}
        <p className="mt-6 text-center text-xs text-brand-ink/45">
          Partners sign in at{" "}
          <Link href="/partner/login" className="font-semibold text-brand-primary">
            the partner portal
          </Link>
          . Restaurant staff at{" "}
          <Link href="/login" className="font-semibold text-brand-primary">
            the Servd dashboard
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
