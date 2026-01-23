'use client';

import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { AuthModal } from '@/components/AuthModal';
import { Hero } from '@/components/home/Hero';
import { Values } from '@/components/home/Values';

export default function Home() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <main className="min-h-screen bg-[#f5f3ed]">
      <Navigation onSignInClick={() => setShowAuthModal(true)} />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <Hero onSignInClick={() => setShowAuthModal(true)} />
      <Values />
      <Footer />
    </main>
  );
}
