'use client';

import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-black border-t border-white/8">
      {/* Top rule accent */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#D4AF37]/20 to-transparent" />

      <div className="max-w-7xl mx-auto px-10 py-14">
        {/* Main row */}
        <div className="flex items-start justify-between gap-12">
          {/* Brand */}
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-7 h-7 border border-[#D4AF37]/20 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-[#D4AF37]/45"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="9" strokeWidth="1.5" />
                  <path d="M12 3v18M3 12h18" strokeWidth="1.5" />
                </svg>
              </div>
              <span className="text-[12px] font-light tracking-[0.22em] uppercase text-[#D4AF37]/60">
                Lithic Earth
              </span>
            </Link>
            <p className="text-[11px] text-white/25 font-light leading-relaxed max-w-[240px]">
              A living archive of Earth's ancient landscapes,
              built by those who believe what's buried still speaks.
            </p>
          </div>

          {/* Links */}
          <div className="flex gap-16">
            <div className="flex flex-col gap-3">
              <p className="text-[9px] text-[#D4AF37]/40 tracking-[0.3em] uppercase font-light mb-1">
                Explore
              </p>
              {[
                { href: '/archive', label: 'Archive' },
                { href: '/contribute', label: 'Contribute' },
                { href: '/about', label: 'About' },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="text-[12px] text-white/35 hover:text-white/70 font-light tracking-wide transition-colors duration-200"
                >
                  {label}
                </Link>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-[9px] text-[#D4AF37]/40 tracking-[0.3em] uppercase font-light mb-1">
                Legal
              </p>
              {[
                { href: '/terms', label: 'Terms' },
                { href: '/privacy', label: 'Privacy' },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="text-[12px] text-white/35 hover:text-white/70 font-light tracking-wide transition-colors duration-200"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom line */}
        <div className="mt-12 pt-8 border-t border-white/6 flex items-center justify-between">
          <p className="text-[10px] text-white/20 font-light tracking-[0.12em]">
            © 2026 LithicEarth · All rights reserved
          </p>
          <p className="text-[10px] text-white/15 font-light tracking-wide">
            Built by{' '}
            <span className="text-[#D4AF37]/25">The Blue Duck LLC</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
