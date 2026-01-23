'use client';

import { Globe2 } from 'lucide-react';
import Link from 'next/link';

interface NavigationProps {
  onSignInClick: () => void;
}

export function Navigation({ onSignInClick }: NavigationProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#3d4f44]/95 backdrop-blur-sm border-b border-[#5b7c6f]/20">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Globe2 className="w-7 h-7 text-[#8b9d8a]" strokeWidth={1.5} />
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold text-[#f5f3ed] tracking-wide">LITHIC</span>
            <span className="text-lg font-light text-[#8b9d8a]">EARTH</span>
          </div>
        </Link>
        <div className="flex items-center gap-8">
          <Link href="/archive" className="text-sm text-[#d4cfc0] hover:text-[#f5f3ed] transition font-light tracking-wide">
            Archive
          </Link>
          <Link href="/about" className="text-sm text-[#d4cfc0] hover:text-[#f5f3ed] transition font-light tracking-wide">
            About
          </Link>
          <Link href="/contribute" className="text-sm text-[#d4cfc0] hover:text-[#f5f3ed] transition font-light tracking-wide">
            Contribute
          </Link>
          <button
            onClick={onSignInClick}
            className="px-5 py-2 bg-[#5b7c6f] text-[#f5f3ed] text-sm font-light tracking-wide hover:bg-[#6b8c7f] transition border border-[#4a6b5e]"
          >
            Sign In
          </button>
        </div>
      </div>
    </nav>
  );
}
