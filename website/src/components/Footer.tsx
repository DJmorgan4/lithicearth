'use client';

import { Globe2 } from 'lucide-react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="py-12 px-6 bg-[#2d3d34] border-t border-[#3d4f44]">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="flex items-center gap-3">
            <Globe2 className="w-6 h-6 text-[#8b9d8a]" strokeWidth={1.5} />
            <span className="text-sm text-[#d4cfc0] font-light tracking-wide">LITHIC EARTH</span>
          </Link>
          <div className="flex gap-8 text-sm text-[#b5b0a0] font-light">
            <Link href="/archive" className="hover:text-[#d4cfc0] transition">Archive</Link>
            <Link href="/about" className="hover:text-[#d4cfc0] transition">About</Link>
            <Link href="/contribute" className="hover:text-[#d4cfc0] transition">Contribute</Link>
            <Link href="#" className="hover:text-[#d4cfc0] transition">Terms</Link>
            <Link href="#" className="hover:text-[#d4cfc0] transition">Privacy</Link>
          </div>
        </div>
        <div className="text-center text-[#7a8a7d] text-xs font-light">
          <p>© 2026 LithicEarth · Documenting our shared planet</p>
          <p className="mt-2">Built by The Blue Duck LLC</p>
        </div>
      </div>
    </footer>
  );
}
