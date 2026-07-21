"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/settings/webex",
    label: "Webex",
    description: "Connect, spaces, sync",
  },
  {
    href: "/settings/email",
    label: "Email & calendar",
    description: "Partner rules, import, and policies",
  },
  {
    href: "/settings/preferences",
    label: "Preferences",
    description: "Theme, app config, and AI",
  },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections">
      <ul className="nav-side">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === "/settings/webex" && pathname === "/settings/ingestion");

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={active ? "nav-side__link nav-side__link--active" : "nav-side__link"}
                aria-current={active ? "page" : undefined}
              >
                <span className="nav-side__label">{item.label}</span>
                <span className="nav-side__description">{item.description}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
