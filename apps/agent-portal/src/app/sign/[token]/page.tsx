import { signingView, type SigningView } from "@/server/contracts";
import { manilaDate } from "@/lib/time";
import { SignForm } from "./SignForm";
import { signAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The shared contract signing page — one implementation for every product.
 * The customer opens the link their product (or their agent) gave them.
 */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await signingView(token).catch((): SigningView => ({ state: "invalid" }));

  const message = (text: string) => (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-xl font-semibold">Subscription agreement</h1>
      <p className="mt-3 text-slate-700">{text}</p>
    </main>
  );
  if (view.state === "invalid") return message("This signing link is not valid.");
  if (view.state === "expired") return message("This signing link has expired. Ask your provider or agent for a new one.");
  if (view.state === "no_template") return message("The agreement is not available yet. Please try again later.");
  if (view.state === "signed") return message(`${view.businessName} signed this agreement on ${manilaDate(view.signedAt)}. Nothing more to do.`);

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-xl font-semibold">{view.title}</h1>
      <p className="mt-1 text-sm text-slate-600">For {view.businessName} · version {view.templateVersion}</p>
      <article className="mt-4 max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed">
        {view.body}
      </article>
      <div className="mt-6">
        <SignForm action={signAction.bind(null, token)} />
      </div>
    </main>
  );
}
