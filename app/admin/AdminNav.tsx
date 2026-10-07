"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminNav() {
  const pathname = usePathname() ?? "";

  const links = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/lots", label: "Lots" },
    { href: "/admin/flow", label: "Flow" },
    { href: "/flow", label: "Flow CMS" },
  ];

  return (
    <nav className="flex items-center gap-6 border-b border-black/10 px-6 py-4">
      {links.map((link) => {
        const active =
          pathname === link.href ||
          (link.href !== "/admin" && pathname.startsWith(`${link.href}/`));

        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              active
                ? "font-medium text-black"
                : "text-black/50 hover:text-black"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}