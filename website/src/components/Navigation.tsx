'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

interface NavigationProps {
  onSignInClick?: () => void;
  /** Optional extra action rendered after nav links (e.g. "Add Site" on archive page) */
  archiveAction?: ReactNode;
}

export function Navigation({ onSignInClick, archiveAction }: NavigationProps) {
  const pathname = usePathname();

  const links = [
    { href: '/archive', label: 'Archive' },
    { href: '/about', label: 'About' },
    { href: '/contribute', label: 'Contribute' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-[2000] pointer-events-none">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 100%)',
          height: '80px',
        }}
      />

      <div className="relative flex items-center justify-between px-8 py-5">
        {/* Logo */}
        <Link href="/" className="pointer-events-auto flex items-center gap-3 group">
          <div className="w-7 h-7 border border-[#D4AF37]/25 group-hover:border-[#D4AF37]/55 transition-colors duration-300 flex items-center justify-center shrink-0">
            <svg
              className="w-4 h-4 text-[#D4AF37]/55 group-hover:text-[#D4AF37]/80 transition-colors duration-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="9" strokeWidth="1.5" />
              <path d="M12 3v18M3 12h18" strokeWidth="1.5" />
              <path
                d="M5.5 7.5C8 8.5 10 9 12 9s4-.5 6.5-1.5M5.5 16.5C8 15.5 10 15 12 15s4 .5 6.5 1.5"
                strokeWidth="1"
              />
            </svg>
          </div>
          <span className="text-[13px] font-light tracking-[0.22em] uppercase text-[#D4AF37]/75 group-hover:text-[#D4AF37] transition-colors duration-300">
            Lithic{' '}
            <span className="text-white/35 group-hover:text-white/55 transition-colors duration-300">
              Earth
            </span>
          </span>
        </Link>

        {/* Links + optional slot + sign in */}
        <div className="flex items-center gap-7 pointer-events-auto">
          {links.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'text-[11px] font-light tracking-[0.18em] uppercase transition-colors duration-200',
                  isActive ? 'text-[#D4AF37]' : 'text-white/45 hover:text-white/80',
                ].join(' ')}
              >
                {label}
              </Link>
            );
          })}

          {archiveAction}

          {onSignInClick && !archiveAction && (
            <button
              onClick={onSignInClick}
              className="px-4 py-2 text-[11px] font-light text-[#D4AF37]/70 hover:text-[#D4AF37] border border-[#D4AF37]/18 hover:border-[#D4AF37]/40 transition-all duration-200 tracking-[0.18em] uppercase"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
