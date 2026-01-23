'use client';

import { useState } from 'react';
import { Camera, MapPin } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { AuthModal } from '@/components/AuthModal';
import { GlobeScene } from '@/components/GlobeScene';

export default function ArchivePage() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <main className="min-h-screen bg-[#f5f3ed]">
      <Navigation onSignInClick={() => setShowAuthModal(true)} />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <section className="relative py-24 px-6 pt-32 bg-[#f5f3ed]">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-8 h-px bg-[#5b7c6f]"></div>
              <span className="text-[#5b7c6f] text-xs tracking-widest font-light">THE ARCHIVE</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-light text-[#2d3d34] mb-4 tracking-wide">Explore by Place</h2>
            <p className="text-lg text-[#5b7c6f] max-w-2xl font-light leading-relaxed">
              Navigate Earth through the eyes of its documentarians—every photograph georeferenced, timestamped, preserved.
            </p>
          </div>
          <div className="bg-white border border-[#d4cfc0] shadow-sm overflow-hidden">
            <div className="h-[600px] relative">
              <GlobeScene />
              <div className="absolute bottom-6 left-6 bg-white/95 border border-[#d4cfc0] p-4 text-sm text-[#5b7c6f] max-w-xs">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4" strokeWidth={1.5} />
                  <span className="font-light tracking-wide">Navigation</span>
                </div>
                <div className="space-y-1.5 text-xs font-light text-[#7a8a7d]">
                  <div>• Drag to rotate globe</div>
                  <div>• Scroll to adjust view</div>
                  <div>• Select markers to view</div>
                </div>
              </div>
            </div>
            <div className="p-8 border-t border-[#d4cfc0] bg-[#fafaf8]">
              <h3 className="text-base font-light text-[#2d3d34] mb-6 tracking-wide">Recent Additions</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="aspect-square bg-[#e8e6dd] border border-[#d4cfc0] flex items-center justify-center">
                    <Camera className="w-8 h-8 text-[#b5b0a0]" strokeWidth={1} />
                  </div>
                ))}
              </div>
              <p className="text-center text-[#9a9589] text-sm mt-6 font-light">Archive begins with first contribution</p>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
