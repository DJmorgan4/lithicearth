'use client';

import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { AuthModal } from '@/components/AuthModal';

const STEPS = [
  {
    number: '01',
    title: 'Find a site',
    body: 'Ancient ruins, environmental anomalies, geological formations, wildlife corridors — anything worth documenting before it disappears.',
  },
  {
    number: '02',
    title: 'Document it',
    body: 'Photograph it. Note the coordinates. Record what you observe. Field notes belong here alongside satellite data and archival imagery.',
  },
  {
    number: '03',
    title: 'Pin it to the globe',
    body: 'Right-click anywhere on the LithicEarth globe to drop a pin, then submit your record to the living archive.',
  },
];

export default function ContributePage() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <main className="min-h-screen bg-black text-white">
      <Navigation onSignInClick={() => setShowAuthModal(true)} />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* Hero */}
      <section className="relative pt-44 pb-28 px-10 border-b border-white/6">
        {/* Decorative corner marks */}
        <div className="absolute left-10 top-32 w-6 h-6 border-l border-t border-[#D4AF37]/20" />
        <div className="absolute right-10 top-32 w-6 h-6 border-r border-t border-[#D4AF37]/20" />

        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] text-[#D4AF37]/50 tracking-[0.45em] uppercase font-light mb-8">
            Contribute
          </p>
          <h1
            className="text-5xl md:text-6xl font-light text-white leading-[1.1] mb-8"
            style={{ fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}
          >
            The earth is still
            <br />
            <span className="text-[#D4AF37]/80">transmitting.</span>
          </h1>
          <p className="text-base text-white/45 font-light leading-relaxed max-w-xl">
            LithicEarth is a living archive built by field researchers, conservationists,
            and anyone paying close enough attention. Your documentation belongs here.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="px-10 py-24 border-b border-white/6">
        <div className="max-w-5xl mx-auto">
          <p className="text-[9px] text-[#D4AF37]/40 tracking-[0.4em] uppercase font-light mb-16">
            How it works
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            {STEPS.map((step, i) => (
              <div
                key={step.number}
                className={`py-10 pr-10 ${i > 0 ? 'md:pl-10 md:border-l border-white/8' : ''}`}
              >
                <p
                  className="text-[40px] font-light text-[#D4AF37]/12 leading-none mb-6"
                  style={{ fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}
                >
                  {step.number}
                </p>
                <h3 className="text-base font-light text-white/90 tracking-wide mb-3">
                  {step.title}
                </h3>
                <p className="text-[13px] text-white/35 font-light leading-relaxed">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-10 py-28">
        <div className="max-w-3xl mx-auto">
          <div className="relative border border-[#D4AF37]/15 p-12">
            {/* Corner marks */}
            <div className="absolute left-0 top-0 w-5 h-5 border-l-2 border-t-2 border-[#D4AF37]/30" />
            <div className="absolute right-0 top-0 w-5 h-5 border-r-2 border-t-2 border-[#D4AF37]/30" />
            <div className="absolute left-0 bottom-0 w-5 h-5 border-l-2 border-b-2 border-[#D4AF37]/30" />
            <div className="absolute right-0 bottom-0 w-5 h-5 border-r-2 border-b-2 border-[#D4AF37]/30" />

            <p className="text-[10px] text-[#D4AF37]/45 tracking-[0.4em] uppercase font-light mb-6">
              Start contributing
            </p>
            <h2
              className="text-3xl font-light text-white mb-4 leading-snug"
              style={{ fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}
            >
              Join the global network
              <br />
              documenting Earth.
            </h2>
            <p className="text-[13px] text-white/35 font-light leading-relaxed mb-10 max-w-md">
              One photograph, one set of coordinates, one field note at a time.
              The archive grows only because people like you show up.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-8 py-3.5 text-[11px] font-light text-black bg-[#D4AF37] hover:bg-[#C9A22E] transition-colors tracking-[0.18em] uppercase"
              >
                Create Account
              </button>
              <a
                href="/archive"
                className="px-8 py-3.5 text-[11px] font-light text-[#D4AF37]/70 hover:text-[#D4AF37] border border-[#D4AF37]/20 hover:border-[#D4AF37]/45 transition-all tracking-[0.18em] uppercase text-center"
              >
                Browse Archive
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
