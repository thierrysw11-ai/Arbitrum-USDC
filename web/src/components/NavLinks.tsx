'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/send', label: 'Send' },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="hidden sm:flex items-center gap-1">
      {links.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-widest transition-colors ${
              active
                ? 'bg-gray-800 text-white'
                : 'text-gray-500 hover:text-white hover:bg-gray-900'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
