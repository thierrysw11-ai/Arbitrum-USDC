'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Send, type LucideIcon } from 'lucide-react';

/**
 * Top-nav links — kept deliberately small for the new positioning.
 *
 *   - Logo (in layout.tsx) is the implicit "Home" link, so we don't need
 *     a separate "Home" / "Dashboard" entry here. The landing page
 *     already shows the markets-at-a-glance grid that the old Dashboard
 *     route used to host.
 *   - "Report" is the primary value-prop entry point — that's where the
 *     wealth-manager-grade analysis lives. Visually emphasized so it
 *     reads as the main thing the dApp does.
 *   - "Send" stays as a utility because it's a real, working multi-token
 *     transfer flow, but it's secondary. Demoted styling.
 *
 * The previous Dashboard / Portfolio / Send three-up nav implied a
 * SaaS-app structure; this leaner two-link nav reads as "go to the
 * thing this site does, plus a side tool."
 */

const links: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  emphasis: 'primary' | 'secondary';
}> = [
  { href: '/portfolio', label: 'Report', icon: FileText, emphasis: 'primary' },
  { href: '/send', label: 'Send', icon: Send, emphasis: 'secondary' },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="hidden sm:flex items-center gap-1.5">
      {links.map(({ href, label, icon: Icon, emphasis }) => {
        const active = pathname === href;
        const baseStyles =
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-widest transition-colors';

        if (emphasis === 'primary') {
          // Primary entry point — visually loud whether active or not so
          // it always reads as the main thing.
          return (
            <Link
              key={href}
              href={href}
              className={`${baseStyles} ${
                active
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'bg-purple-600/15 text-purple-300 hover:bg-purple-600/25 border border-purple-500/30'
              }`}
            >
              <Icon size={12} />
              {label}
            </Link>
          );
        }

        return (
          <Link
            key={href}
            href={href}
            className={`${baseStyles} ${
              active
                ? 'bg-gray-800 text-white'
                : 'text-gray-500 hover:text-white hover:bg-gray-900'
            }`}
          >
            <Icon size={12} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
