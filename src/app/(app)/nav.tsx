"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./ui";

type Item = { href: string; label: string; icon: IconName; count?: number };

/** Sidebar navigation; the current section is marked with aria-current so it is announced, not only colored. */
export function Nav({ counts }: { counts: { analises: number; processos: number } }) {
  const path = usePathname();
  const items: Item[] = [
    { href: "/", label: "Painel", icon: "dashboard" },
    { href: "/analises", label: "Análises e cálculos", icon: "calc", count: counts.analises },
    { href: "/processos", label: "Processos", icon: "board", count: counts.processos },
  ];
  const current = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  return (
    <nav className="nav" aria-label="Principal">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={current(i.href) ? "page" : undefined}>
          <Icon name={i.icon} />
          <span>{i.label}</span>
          {i.count !== undefined && <span className="count">{i.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
