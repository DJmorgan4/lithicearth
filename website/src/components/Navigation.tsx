 
 
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';

interface NavigationProps {
  onSignInClick?: () => void;
  /** Optional extra action rendered after nav links (e.g. "Add Site" on archive page) */
  archiveAction?: ReactNode;
}

export function Navigation({ onSignInClick, archiveAction }: NavigationProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { href: '/archive', label: 'Archive' },
    { href: '/challenge', label: 'Challenge' },
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

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-7 pointer-events-auto">
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

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="md:hidden pointer-events-auto flex flex-col gap-1.5 p-2"
          aria-label="Toggle menu"
        >
          <span className="block w-5 h-px transition-all duration-200" style={{ background: menuOpen ? 'rgba(212,175,55,0.8)' : 'rgba(212,175,55,0.5)', transform: menuOpen ? 'rotate(45deg) translateY(4px)' : 'none' }} />
          <span className="block w-5 h-px transition-all duration-200" style={{ background: 'rgba(212,175,55,0.5)', opacity: menuOpen ? 0 : 1 }} />
          <span className="block w-5 h-px transition-all duration-200" style={{ background: menuOpen ? 'rgba(212,175,55,0.8)' : 'rgba(212,175,55,0.5)', transform: menuOpen ? 'rotate(-45deg) translateY(-4px)' : 'none' }} />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden pointer-events-auto absolute top-full left-0 right-0 bg-[#020508]/95 border-t border-[#D4AF37]/10 flex flex-col px-6 py-4 gap-4">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="text-[12px] font-light tracking-[0.18em] uppercase text-white/55 hover:text-white/90 transition-colors duration-200"
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
