"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SettingsMenu } from "./settings-menu";

const NAV_ITEMS = [
  { href: "/dashboard", label: "My Priorities", match: (path: string) => path === "/dashboard" || path.startsWith("/dashboard/") },
  { href: "/technologies", label: "Technology Updates", match: (path: string) => path.startsWith("/technologies") },
  { href: "/internal-calls", label: "Meeting Summaries", match: (path: string) => path.startsWith("/internal-calls") },
] as const;

interface AppNavProps {
  tenantLabel: string;
  displayName: string;
}

export function AppNav({ tenantLabel, displayName }: AppNavProps) {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Main">
      <div className="app-nav__start">
        <Link href="/dashboard" className="app-nav__brand">
          Next
        </Link>
        <div className="app-nav__links">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "app-nav__link app-nav__link--active" : "app-nav__link"}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="app-nav__end">
        <span className="app-nav__meta">{tenantLabel}</span>
        <span className="app-nav__email">{displayName}</span>
        <SettingsMenu />
      </div>
    </nav>
  );
}
