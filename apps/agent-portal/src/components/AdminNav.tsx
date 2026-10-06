"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export interface AdminNavLink {
  href: string;
  label: string;
  icon: IconName;
}

/**
 * The sidebar links. A client component only so it can highlight the page
 * you are on; which links appear is decided on the server.
 */
export function AdminNav({ links }: { links: AdminNavLink[] }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-4 lg:pb-0">
      {links.map((l) => {
        const active = isActive(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              active ? "bg-white/20 font-medium text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon name={l.icon} className="h-[18px] w-[18px] shrink-0" />
            <span className="whitespace-nowrap">{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
