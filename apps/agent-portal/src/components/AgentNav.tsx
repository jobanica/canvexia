"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/customers", label: "Customers", icon: "users" },
  { href: "/earnings", label: "Earnings", icon: "chart" },
  { href: "/payouts", label: "Payouts", icon: "wallet" },
  { href: "/profile", label: "Profile", icon: "user" },
];

/**
 * The floating tab bar. A client component only to light up the tab you are
 * on: the active tab grows into a pill with its label, the rest are icons.
 */
export function AgentNav() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

  return (
    <nav className="fixed inset-x-0 bottom-4 z-20 px-4">
      <div className="mx-auto flex max-w-lg items-center justify-between rounded-full border border-white/10 bg-[#1d1b2b]/90 p-1.5 shadow-2xl shadow-black/50 backdrop-blur">
        {TABS.map((t) => {
          const active = isActive(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-label={t.label}
              aria-current={active ? "page" : undefined}
              className={`flex items-center justify-center gap-2 rounded-full py-2.5 text-xs font-medium transition-all ${
                active
                  ? "bg-gradient-to-r from-[#7c5cf5] to-[#5b3fd6] px-4 text-white shadow-lg shadow-violet-900/50"
                  : "px-3 text-slate-400 hover:text-white"
              }`}
            >
              <Icon name={t.icon} className="h-5 w-5" />
              {active && <span>{t.label}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
