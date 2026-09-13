"use client";

import { useActionState, useState } from "react";
import { updateDeliverySettings, type FormState, type DeliverySettingsView } from "@/server/delivery/settings";
import { SubmitButton } from "./SubmitButton";
import { CopyLink } from "@/components/super-admin/CopyLink";

const field = "mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

export function DeliverySettingsForm({
  initial,
  webhookUrl,
}: {
  initial: DeliverySettingsView;
  webhookUrl: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateDeliverySettings, null);
  const [provider, setProvider] = useState(initial.provider);

  return (
    <form action={action} className="space-y-5 rounded-tile border border-plum-ink/10 bg-white p-5">
      {/* Provider choice */}
      <div>
        <span className="text-sm font-medium">How do you book riders?</span>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {[
            { key: "manual", title: "Manual", desc: "You book by phone/app, update status here." },
            { key: "deeplink", title: "Deep link", desc: "Open the provider's app pre-filled." },
            { key: "api", title: "API", desc: "Auto-book & live-track via the provider's API." },
          ].map((opt) => (
            <label
              key={opt.key}
              className={`cursor-pointer rounded-xl border p-3 text-sm ${
                provider === opt.key ? "border-brand-primary bg-brand-primary/5" : "border-plum-ink/15"
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={opt.key}
                checked={provider === opt.key}
                onChange={() => setProvider(opt.key as DeliverySettingsView["provider"])}
                className="sr-only"
              />
              <span className="font-semibold capitalize">{opt.title}</span>
              <span className="mt-0.5 block text-xs text-plum-ink/55">{opt.desc}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="block text-sm">
        <span className="font-medium">Provider name (optional)</span>
        <input name="providerKey" defaultValue={initial.providerKey} placeholder="e.g. ServdGo, Lalamove, local rider co." className={field} />
        <span className="mt-1 block text-xs text-plum-ink/45">
          Type <code>servdgo</code> here to use the built-in ServdGo adapter — it knows their
          endpoints, so the fields below are only the URL and your credentials.
        </span>
      </label>

      {/* Deep link config */}
      {provider === "deeplink" && (
        <label className="block text-sm">
          <span className="font-medium">Deep-link URL template</span>
          <textarea
            name="deepLinkTemplate"
            defaultValue={initial.deepLinkTemplate}
            rows={3}
            placeholder="https://app.provider.com/book?from={pickupAddress}&to={dropoffAddress}&phone={dropoffPhone}"
            className={field}
          />
          <span className="mt-1 block text-xs text-plum-ink/45">
            Tokens get filled per order: <code>{"{pickupAddress}"}</code> <code>{"{pickupLat}"}</code>{" "}
            <code>{"{pickupLng}"}</code> <code>{"{dropoffAddress}"}</code> <code>{"{dropoffLat}"}</code>{" "}
            <code>{"{dropoffLng}"}</code> <code>{"{dropoffName}"}</code> <code>{"{dropoffPhone}"}</code>{" "}
            <code>{"{ref}"}</code>.
          </span>
        </label>
      )}

      {/* API config */}
      {provider === "api" && (
        <div className="space-y-4 rounded-xl border border-plum-ink/10 p-4">
          <p className="text-xs text-plum-ink/55">
            For providers with a REST API. Credentials are stored encrypted. ServdGo has a
            finished adapter — name it above and these three fields are all it needs. Any other
            provider still needs its endpoints and field mapping filled in first.
          </p>
          <label className="block text-sm">
            <span className="font-medium">API base URL</span>
            <input name="apiBaseUrl" defaultValue={initial.apiBaseUrl} placeholder="https://api.provider.com/v1" className={field} />
            <span className="mt-1 block text-xs text-plum-ink/45">
              No trailing slash. For ServdGo this is their functions root —
              <code> https://&lt;project-ref&gt;.supabase.co/functions/v1</code> — and the API key
              is the <code>sgo_…</code> one their operator mints for this restaurant.
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-medium">API key</span>
            <input
              name="apiKey"
              type="password"
              placeholder={initial.hasApiKey ? "•••••••• (saved — leave blank to keep)" : "Paste the provider API key"}
              className={field}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Webhook signing secret</span>
            <input
              name="webhookSecret"
              type="password"
              placeholder={initial.hasWebhookSecret ? "•••••••• (saved — leave blank to keep)" : "Used to verify status webhooks"}
              className={field}
            />
          </label>
          {/* The provider asks the restaurant for this. It's unique per
              restaurant — the id in the path is how an incoming rider update is
              matched to the right shop — so it can't be one shared URL. */}
          <div className="rounded-lg bg-cream px-3 py-2 text-xs">
            <p className="font-semibold text-plum-ink/70">
              Your webhook URL — give this to the delivery provider:
            </p>
            <p className="mt-1 break-all font-mono text-plum-ink">{webhookUrl}</p>
            <div className="mt-2">
              <CopyLink url={webhookUrl} label="Copy webhook URL" />
            </div>
            <p className="mt-2 text-plum-ink/55">
              They POST rider updates here — accepted, picked up, delivered — signed with the
              webhook secret above, which is what proves the call really came from them.
            </p>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} />
        Enable the &quot;Book rider&quot; button on delivery orders
      </label>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      <SubmitButton>Save delivery settings</SubmitButton>
    </form>
  );
}
