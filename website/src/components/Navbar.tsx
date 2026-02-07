'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AuthModal } from '@/components/AuthModal';

export function Navbar() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 px-8 py-6">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <Link href="/" className="group">
            <h1 className="text-2xl font-light text-white/90 tracking-tight group-hover:text-white transition-colors">
              LithicEarth
            </h1>
          </Link>
          
          <div className="flex items-center gap-8">
            <Link 
              href="/archive"
              className="text-sm font-light text-white/70 hover:text-white transition-colors tracking-wide"
            >
              Archive
            </Link>
            <Link 
              href="/about"
              className="text-sm font-light text-white/70 hover:text-white transition-colors tracking-wide"
            >
              About
            </Link>
            <button
              onClick={() => setShowAuthModal(true)}
              className="text-sm font-light text-white/70 hover:text-white transition-colors tracking-wide"
            >
              Sign In
            </button>
          </div>
        </div>
      </nav>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </>
  );
}
