/**
 * A sample Servd ordering page, drawn in markup rather than shipped as an
 * image. Nothing to download, nothing to decode, scales perfectly on any
 * screen — which matters when the hero has to paint fast on a mid-range phone
 * inside the Facebook browser.
 *
 * Purely decorative: hidden from assistive tech, since the sentence next to it
 * already says what it is.
 */
export function PhoneMock() {
  const items: [string, string][] = [
    ["Chicken Adobo Rice Bowl", "₱180"],
    ["Sisig Silog", "₱165"],
    ["Iced Latte", "₱120"],
  ];

  return (
    <div aria-hidden="true" className="mx-auto w-[236px] select-none sm:w-[264px]">
      <div className="rounded-[2.2rem] border-[7px] border-plum-ink bg-plum-ink p-0 shadow-2xl">
        <div className="overflow-hidden rounded-[1.7rem] bg-white">
          {/* Storefront header */}
          <div className="bg-brand-gradient px-4 pb-5 pt-4 text-white">
            <div className="mx-auto h-1 w-10 rounded-full bg-white/40" />
            <div className="mt-4 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/25 font-heading text-sm font-extrabold">
                LK
              </div>
              <div>
                <p className="font-heading text-sm font-extrabold leading-tight">
                  Lola&apos;s Kitchen
                </p>
                <p className="text-[10px] text-white/80">Open · Ready in 15 min</p>
              </div>
            </div>
          </div>

          <div className="space-y-2 px-3 py-3">
            <div className="flex gap-1.5">
              {["All", "Rice bowls", "Drinks"].map((c, i) => (
                <span
                  key={c}
                  className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${
                    i === 0 ? "bg-plum-ink text-white" : "bg-cream text-plum-ink/50"
                  }`}
                >
                  {c}
                </span>
              ))}
            </div>

            {items.map(([name, price]) => (
              <div
                key={name}
                className="flex items-center gap-2.5 rounded-xl border border-plum-ink/10 p-2"
              >
                <div className="h-10 w-10 shrink-0 rounded-lg bg-cream" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-bold text-plum-ink">{name}</p>
                  <p className="text-[10px] font-semibold text-brand-primary">{price}</p>
                </div>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white">
                  +
                </span>
              </div>
            ))}

            <div className="mt-1 rounded-full bg-brand-gradient py-2 text-center text-[11px] font-extrabold text-white">
              Place order · ₱465
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
