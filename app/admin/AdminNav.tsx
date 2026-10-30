"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  {
    title: "Главное",
    links: [
      { href: "/admin", label: "Обзор", icon: "↗" },
      { href: "/admin/flow-issues", label: "Газета Flow", icon: "📰" },
      { href: "/admin/media", label: "Медиа публикации", icon: "▦" },
      { href: "/flow", label: "Стрим Flow", icon: "≋" },
    ],
  },
  {
    title: "Издательство",
    links: [
      { href: "/admin/letters", label: "Архив писем", icon: "✉" },
      { href: "/admin/newsletter-jobs", label: "Логи доставки", icon: "↗" },
      { href: "/admin/projects", label: "Проекты", icon: "◇" },
      { href: "/admin/postcards", label: "Открытки", icon: "▧" },
    ],
  },
  {
    title: "Аудитория",
    links: [
      { href: "/admin/users", label: "Пользователи & Подписчики", icon: "○" },
    ],
  },
  {
    title: "Pierrot",
    links: [
      { href: "/admin/pierrot", label: "Pierrot Intelligence", icon: "◐" },
      { href: "/admin/brain", label: "Brain ingestion", icon: "◇" },
    ],
  },
];

export default function AdminNav() {
  const pathname = usePathname() ?? "";

  function isActive(href: string) {
    return href === "/admin"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav
      aria-label="Admin navigation"
      className="w-full shrink-0 lg:sticky lg:top-8 lg:w-[224px] lg:self-start"
    >
      <div className="border-b border-[#E5E1DC] pb-4 lg:border-b-0">
        <Link
          href="/admin"
          className="block px-1 text-lg font-semibold tracking-[-0.05em] text-[#211F1F]"
        >
          MERKUROV<span className="text-[#990F3D]">.</span>LOVE
        </Link>
        <p className="mt-1 px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#89827B]">
          Administration
        </p>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-2 lg:mt-7 lg:block lg:space-y-6 lg:overflow-visible lg:pb-0">
        {groups.map((group) => (
          <section key={group.title} className="min-w-max lg:min-w-0">
            <h2 className="hidden px-3 pb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[#A29B94] lg:block">
              {group.title}
            </h2>

            <ul className="flex gap-1 lg:block lg:space-y-1">
              {group.links.map((link) => {
                const active = isActive(link.href);

                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "flex items-center gap-3 border px-3 py-2.5 text-xs transition-colors lg:w-full lg:border-transparent lg:text-[13px]",
                        active
                          ? "border-[#E7C9D2] bg-[#F8EAF0] text-[#7E0C33] lg:border-[#E7C9D2]"
                          : "border-[#E7E2DC] bg-white/70 text-[#625D58] hover:border-[#CFC7C0] hover:bg-white lg:bg-transparent lg:hover:bg-white/80",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden="true"
                        className="w-4 shrink-0 text-center text-sm opacity-70"
                      >
                        {link.icon}
                      </span>
                      <span className="whitespace-nowrap">{link.label}</span>
                      {active && (
                        <span className="ml-auto hidden h-1.5 w-1.5 shrink-0 bg-[#990F3D] lg:block" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-8 hidden border-t border-[#E5E1DC] pt-4 lg:block">
        <Link
          href="/"
          className="text-xs text-[#827B74] transition hover:text-[#990F3D]"
        >
          ← Open public site
        </Link>
      </div>
    </nav>
  );
}