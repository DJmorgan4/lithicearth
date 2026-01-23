'use client';

import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { AuthModal } from '@/components/AuthModal';

export default function AboutPage() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <main className="min-h-screen bg-[#f5f3ed]">
      <Navigation onSignInClick={() => setShowAuthModal(true)} />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <section className="relative py-24 px-6 pt-32 bg-[#3d4f44]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-8 h-px bg-[#8b9d8a]"></div>
              <span className="text-[#8b9d8a] text-xs tracking-widest font-light">PURPOSE</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-light text-[#f5f3ed] mb-8 tracking-wide leading-tight">
              Building a record for the next century
            </h2>
          </div>
          <div className="space-y-6 text-[#d4cfc0] font-light leading-relaxed text-lg">
            <p>LithicEarth documents the physical world as experienced by people—not through satellites or sensors alone, but through the lens of human observation.</p>
            <p>Over time, this archive becomes invaluable: tracking coastal erosion, urban growth, habitat change, climate patterns.</p>
            <div className="border-l-2 border-[#5b7c6f] pl-6 my-12">
              <p className="text-xl text-[#8b9d8a] font-light italic">
                &quot;The best time to start documenting Earth was fifty years ago. The second best time is today.&quot;
              </p>
            </div>
            <p>Contributors maintain full attribution. Images are geotagged and timestamped to archival standards.</p>
          </div>
        </div>
      </section>
      <section className="relative py-24 px-6 bg-[#f5f3ed]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-8 h-px bg-[#5b7c6f]"></div>
              <span className="text-[#5b7c6f] text-xs tracking-widest font-light">PRINCIPLES</span>
            </div>
            <h2 className="text-4xl font-light text-[#2d3d34] tracking-wide">What guides this work</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: 'Long-term thinking', description: 'Building an archive meant to last generations.' },
              { title: 'Human-centered', description: 'Contributors own their work, communities own their stories.' },
              { title: 'Rigorous standards', description: 'Metadata integrity and ethical stewardship.' },
            ].map((value) => (
              <div key={value.title} className="bg-white border border-[#d4cfc0] p-8">
                <h3 className="text-lg font-light text-[#2d3d34] mb-3 tracking-wide">{value.title}</h3>
                <p className="text-[#7a8a7d] leading-relaxed font-light text-sm">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
