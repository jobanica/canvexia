"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS, type NavEntry } from "./nav-items";

export type { NavEntry };

/**
 * The nav list, grouped, with the active item on the brand gradient.
 *
 * ACTIVE IS AN EXACT MATCH FOR "/" AND A PREFIX FOR EVERYTHING ELSE. A prefix
 * test on the dashboard matches every page in the app, which lights up two
 * items at once and teaches people the highlight means nothing.
 */
export function SidebarNav({ links, onNavigate }: { links: NavEntry[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  const groups = links.reduce<Record<string, NavEntry[]>>((acc, l) => {
    (acc[l.group] ??= []).push(l);
    return acc;
  }, {});

  return (
    <nav className="px-3 py-2">
      {Object.entries(groups).map(([group, items]) => (
        <div key={group} className="mb-4">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {group}
          </p>
          {items.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            const Icon = NAV_ICONS[l.icon];
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={onNavigate}
                className={`mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "brand-gradient text-white shadow-lg shadow-violet-900/40"
                    : "text-slate-500 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon />
                {l.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
