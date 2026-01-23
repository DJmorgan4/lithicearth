'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Globe2, Archive, Map } from 'lucide-react';
import { AuthModal } from '@/components/AuthModal';
import { GlobeScene } from '@/components/GlobeScene';

export default function Home() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <main className="min-h-screen bg-[#f5f3ed]">
      {/* Navigation */}
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
            <Link
              href="/archive"
              className="text-sm text-[#d4cfc0] hover:text-[#f5f3ed] transition font-light tracking-wide"
            >
              Archive
            </Link>
            <Link
              href="/about"
              className="text-sm text-[#d4cfc0] hover:text-[#f5f3ed] transition font-light tracking-wide"
            >
              About
            </Link>
            <Link
              href="/contribute"
              className="text-sm text-[#d4cfc0] hover:text-[#f5f3ed] transition font-light tracking-wide"
            >
              Contribute
            </Link>
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-5 py-2 bg-[#5b7c6f] text-[#f5f3ed] text-sm font-light tracking-wide hover:bg-[#6b8c7f] transition border border-[#4a6b5e]"
            >
              Sign In
            </button>
          </div>
        </div>
      </nav>

      {/* Auth Modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center bg-[#2d3d34]">
        <div className="absolute inset-0 opacity-60">
          <GlobeScene />
        </div>

        <div className="absolute inset-0 bg-gradient-to-b from-[#2d3d34]/80 via-[#2d3d34]/60 to-[#2d3d34]" />

        <div className="relative z-10 max-w-6xl mx-auto px-6 text-center pt-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          >
            {/* Archival badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#5b7c6f]/20 border border-[#8b9d8a]/30 mb-12">
              <Archive className="w-3.5 h-3.5 text-[#8b9d8a]" strokeWidth={1.5} />
              <span className="text-[#d4cfc0] text-xs font-light tracking-widest">EST. 2026</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-light text-[#f5f3ed] mb-6 leading-tight tracking-wide">
              A Living Archive
              <br />
              <span className="text-[#8b9d8a] font-normal">of Earth</span>
            </h1>

            <p className="text-xl md:text-2xl text-[#d4cfc0] mb-8 max-w-3xl mx-auto font-light leading-relaxed">
              Documenting our planet, one photograph at a time
            </p>

            <p className="text-base text-[#b5b0a0] mb-16 max-w-2xl mx-auto font-light leading-relaxed">
              LithicEarth preserves the human experience of place—a continuous record built by people, for the future.
              Every image anchors a moment. Together, they become something larger: a living map of change, memory, and stewardship.
            </p>

            {/* Simple stats */}
            <div className="flex justify-center gap-16 mb-16 text-center">
              <div>
                <div className="text-4xl font-light text-[#8b9d8a] mb-1">0</div>
                <div className="text-[#b5b0a0] text-xs tracking-widest font-light">PHOTOGRAPHS</div>
              </div>
              <div className="border-l border-[#5b7c6f]/30" />
              <div>
                <div className="text-4xl font-light text-[#8b9d8a] mb-1">0</div>
                <div className="text-[#b5b0a0] text-xs tracking-widest font-light">LOCATIONS</div>
              </div>
              <div className="border-l border-[#5b7c6f]/30" />
              <div>
                <div className="text-4xl font-light text-[#8b9d8a] mb-1">∞</div>
                <div className="text-[#b5b0a0] text-xs tracking-widest font-light">YEARS AHEAD</div>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4 justify-center">
              <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/archive"
                  className="inline-flex items-center gap-3 px-8 py-3.5 bg-[#5b7c6f] text-[#f5f3ed] font-light text-sm tracking-wide hover:bg-[#6b8c7f] transition border border-[#4a6b5e]"
                >
                  <Map className="w-4 h-4" strokeWidth={1.5} />
                  Explore Archive
                </Link>
              </motion.div>

              <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/game"
                  className="inline-flex items-center gap-3 px-8 py-3.5 bg-transparent text-[#d4cfc0] font-light text-sm tracking-wide hover:bg-[#3d4f44] transition border border-[#5b7c6f]"
                >
                  <span className="text-base">◆</span>
                  Discovery Game
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}

