"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createOutreachVideo,
  getOutreachStatus,
  getOutreachDownloadUrl,
  retryOutreachRender,
  deleteOutreachVideo,
} from "@/server/outreach/actions";
import { outreachScript } from "@/lib/outreach/script";
import type { OutreachVideoRow } from "@/server/outreach/queries";

type Prospect = { id: string; name: string; stage: string };

const STATUS_META: Record<string, { label: string; cls: string }> = {
  awaiting_recording: { label: "Waiting for recording", cls: "bg-mango/15 text-mango" },
  uploading: { label: "Uploading…", cls: "bg-sky-500/15 text-sky-700" },
  rendering: { label: "Rendering…", cls: "bg-sky-500/15 text-sky-700" },
  ready: { label: "Ready ✓", cls: "bg-green-100 text-green-700" },
  failed: { label: "Failed", cls: "bg-guava/15 text-guava" },
};

function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.awaiting_recording;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${m.cls}`}>{m.label}</span>;
}

/** The QR + live-status modal for one freshly-created outreach video. */
function CreateModal({
  video,
  prospectName,
  onClose,
}: {
  video: { id: string; recordUrl: string; qrDataUrl: string };
  prospectName: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState("awaiting_recording");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const poll = useCallback(async () => {
    const s = await getOutreachStatus(video.id);
    if (s) {
      setStatus(s.status);
      setError(s.errorMessage);
    }
  }, [video.id]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [poll]);

  async function download() {
    setBusy(true);
    const res = await getOutreachDownloadUrl(video.id);
    setBusy(false);
    if (res.ok && res.url) window.open(res.url, "_blank");
    else setError(res.error ?? "Couldn't download.");
  }
  async function retry() {
    setBusy(true);
    await retryOutreachRender(video.id);
    setBusy(false);
    poll();
  }

  const terminal = status === "ready" || status === "failed";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-tile bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">Recording for</p>
            <h2 className="font-heading text-xl font-bold">{prospectName}</h2>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-plum-ink/40">×</button>
        </div>

        {!terminal ? (
          <>
            <p className="mt-3 text-sm text-plum-ink/60">
              Scan this with your phone to open the record page, then read the opener and record a
              short intro. This screen updates automatically.
            </p>
            <div className="mt-3 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={video.qrDataUrl} alt="Record QR" className="h-52 w-52 rounded-lg border border-plum-ink/10" />
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              <StatusPill status={status} />
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(video.recordUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    /* ignore */
                  }
                }}
                className="text-xs font-semibold text-brand-primary"
              >
                {copied ? "Copied ✓" : "Copy record link"}
              </button>
            </div>

            <div className="mt-4 rounded-lg bg-cream/60 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-plum-ink/40">Suggested opener</p>
              <p className="mt-1 text-sm text-plum-ink/80">{outreachScript(prospectName)}</p>
            </div>
          </>
        ) : status === "ready" ? (
          <div className="mt-4 text-center">
            <p className="text-4xl">✅</p>
            <p className="mt-2 font-heading text-lg font-bold">Your video is ready</p>
            <p className="mt-1 text-sm text-plum-ink/55">Download it and send it to {prospectName} on Messenger.</p>
            <button
              onClick={download}
              disabled={busy}
              className="mt-4 w-full rounded-full bg-brand-gradient py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              ⬇ Download MP4
            </button>
          </div>
        ) : (
          <div className="mt-4 text-center">
            <p className="text-4xl">⚠️</p>
            <p className="mt-2 font-heading text-lg font-bold text-guava">Rendering failed</p>
            {error && <p className="mt-1 text-sm text-plum-ink/55">{error}</p>}
            <button onClick={retry} disabled={busy} className="mt-4 w-full rounded-full btn-brand py-3 text-sm font-bold disabled:opacity-60">
              Retry render
            </button>
          </div>
        )}

        <button
          onClick={() => {
            onClose();
            router.refresh();
          }}
          className="mt-4 w-full rounded-lg border border-plum-ink/15 py-2 text-sm font-semibold hover:bg-cream"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function OutreachClient({
  clients,
  history,
  workerConfigured,
}: {
  clients: Prospect[];
  history: OutreachVideoRow[];
  workerConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<{ id: string; recordUrl: string; qrDataUrl: string; name: string } | null>(null);
  const creatingRef = useRef<string | null>(null);

  const q = search.trim().toLowerCase();
  const shown = q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;

  function create(c: Prospect) {
    creatingRef.current = c.id;
    startTransition(async () => {
      const res = await createOutreachVideo(c.id);
      creatingRef.current = null;
      if (res.ok && res.id && res.recordUrl && res.qrDataUrl) {
        setActive({ id: res.id, recordUrl: res.recordUrl, qrDataUrl: res.qrDataUrl, name: c.name });
      } else {
        alert(res.error ?? "Couldn't start the outreach video.");
      }
    });
  }

  async function downloadHistory(id: string) {
    const res = await getOutreachDownloadUrl(id);
    if (res.ok && res.url) window.open(res.url, "_blank");
    else alert(res.error ?? "Not ready yet.");
  }

  return (
    <div className="space-y-6">
      {!workerConfigured && (
        <p className="rounded-tile border border-mango/40 bg-mango/10 p-3 text-xs text-plum-ink/70">
          Render worker not configured — for now the finished file is your recorded intro. Set{" "}
          <code>WORKER_URL</code> + <code>WORKER_SHARED_SECRET</code> to stitch the pre-baked
          solution/CTA tail onto every intro automatically.
        </p>
      )}

      {/* Prospect picker */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-bold">Pick a prospect</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prospects…"
            className="w-56 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
        </div>
        <div className="overflow-hidden rounded-tile border border-plum-ink/10 bg-white">
          <ul className="divide-y divide-plum-ink/5">
            {shown.slice(0, 60).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-xs text-plum-ink/40 capitalize">{c.stage.replace(/_/g, " ")}</span>
                </span>
                <button
                  onClick={() => create(c)}
                  disabled={pending && creatingRef.current === c.id}
                  className="shrink-0 rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  🎥 New outreach video
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-plum-ink/40">No prospects match.</li>}
          </ul>
        </div>
        {shown.length > 60 && <p className="mt-1 text-xs text-plum-ink/40">Showing 60 — search to narrow down.</p>}
      </section>

      {/* History */}
      <section>
        <h2 className="mb-2 font-heading text-lg font-bold">Recent videos</h2>
        {history.length === 0 ? (
          <p className="rounded-tile border border-dashed border-plum-ink/15 bg-white p-5 text-sm text-plum-ink/50">
            None yet. Create one above.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="text-plum-ink/50">
                <tr className="border-b border-plum-ink/10">
                  <th className="px-3 py-2">Prospect</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((v) => (
                  <tr key={v.id} className="border-t border-plum-ink/5">
                    <td className="px-3 py-2 font-medium">{v.clientName}</td>
                    <td className="px-3 py-2"><StatusPill status={v.status} /></td>
                    <td className="px-3 py-2 text-plum-ink/50">{new Date(v.createdAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        {v.hasFinal && (
                          <button
                            onClick={() => downloadHistory(v.id)}
                            className="rounded-lg bg-brand-gradient px-2.5 py-1.5 text-xs font-semibold text-white"
                          >
                            ⬇ MP4
                          </button>
                        )}
                        {v.status === "failed" && (
                          <button
                            onClick={() => startTransition(async () => { await retryOutreachRender(v.id); router.refresh(); })}
                            className="rounded-lg border border-plum-ink/15 px-2.5 py-1.5 text-xs font-semibold hover:bg-cream"
                          >
                            Retry
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`Delete this video for ${v.clientName}?`))
                              startTransition(async () => { await deleteOutreachVideo(v.id); router.refresh(); });
                          }}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-guava hover:bg-guava/10"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {active && (
        <CreateModal
          video={{ id: active.id, recordUrl: active.recordUrl, qrDataUrl: active.qrDataUrl }}
          prospectName={active.name}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
