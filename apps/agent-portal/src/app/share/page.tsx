import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getSignedIn } from "@/server/auth";
import { agentDb } from "@/server/scoped-db";
import { AgentShell } from "@/components/AgentShell";
import { ShareButtons } from "@/components/ShareButtons";
import { referralLink } from "@/lib/referral-link";

export const dynamic = "force-dynamic";

export default async function SharePage() {
  const who = await getSignedIn();
  if (!who) redirect("/login?next=/share");
  if (who.kind === "staff") redirect("/admin");
  if (who.status === "removed") redirect("/login");

  const products = await agentDb(who.agentId, (tx) =>
    tx.agentProduct.findMany({
      where: { status: "active", signupUrl: { not: null } },
      select: { id: true, name: true, signupUrl: true },
      orderBy: { name: "asc" },
    }),
  );

  const cards = await Promise.all(
    products.map(async (p) => {
      const url = referralLink(p.signupUrl!, who.referralCode);
      return { ...p, url, qr: await QRCode.toDataURL(url, { margin: 1, width: 480 }) };
    }),
  );

  return (
    <AgentShell agent={who}>
      <h1 className="text-xl font-semibold">Share</h1>
      {who.status !== "active" ? (
        <p className="mt-3 text-sm text-slate-600">
          Your links work once your account is active.
        </p>
      ) : cards.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">No products are open for referrals yet.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-600">
            The customer can also type your code <strong className="font-mono">{who.referralCode}</strong>{" "}
            when they sign up.
          </p>
          {cards.map((c) => (
            <section key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold">{c.name}</h2>
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing to optimise */}
              <img src={c.qr} alt={`QR code for your ${c.name} link`} className="mx-auto my-3 w-56" />
              <p className="mb-3 break-all rounded bg-slate-50 p-2 font-mono text-xs text-slate-700">{c.url}</p>
              <ShareButtons url={c.url} text={`Sign up for ${c.name}`} />
            </section>
          ))}
        </div>
      )}
    </AgentShell>
  );
}
