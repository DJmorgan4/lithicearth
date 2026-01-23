'use client';

import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { AuthModal } from '@/components/AuthModal';

export default function ContributePage() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <main className="min-h-screen bg-[#f5f3ed]">
      <Navigation onSignInClick={() => setShowAuthModal(true)} />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <section className="relative py-24 px-6 pt-32 bg-[#5b7c6f] min-h-[80vh] flex items-center">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-light text-[#f5f3ed] mb-6 tracking-wide">Start contributing today</h2>
          <p className="text-xl text-[#d4cfc0] mb-12 font-light leading-relaxed">
            Join the global network documenting Earth—one photograph, one place, one moment
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={() => setShowAuthModal(true)} className="px-10 py-4 bg-[#f5f3ed] text-[#2d3d34] font-light tracking-wide hover:bg-white transition border border-[#e8e6dd]">
              Create Account
            </button>
            <button className="px-10 py-4 bg-transparent text-[#f5f3ed] font-light tracking-wide border border-[#8b9d8a] hover:bg-[#6b8c7f] transition">
              Learn More
            </button>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
