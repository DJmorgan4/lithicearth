'use client';

import { Suspense, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, MeshDistortMaterial, Stars } from '@react-three/drei';
import { motion } from 'framer-motion';
import { Globe2, MapPin, Camera, Users, ArrowRight, Archive, Clock, Map } from 'lucide-react';
import * as THREE from 'three';
import { AuthModal } from '@/components/AuthModal';

function InteractiveGlobe() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.001;
    }
  });

  return (
    <Sphere ref={meshRef} args={[1, 100, 100]}>
      <MeshDistortMaterial
        color="#5b7c6f"
        attach="material"
        distort={0.2}
        speed={1}
        roughness={0.6}
        metalness={0.3}
      />
    </Sphere>
  );
}

function GlobeScene() {
  return (
    <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <pointLight position={[-10, -10, -10]} intensity={0.3} color="#8b9d8a" />
      <Suspense fallback={null}>
        <InteractiveGlobe />
        <Stars radius={100} depth={50} count={3000} factor={3} saturation={0} fade speed={0.5} />
      </Suspense>
      <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.3} />
    </Canvas>
  );
}

export default function Home() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <main className="min-h-screen bg-[#f5f3ed]">
      {/* Navigation - Vintage inspired */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#3d4f44]/95 backdrop-blur-sm border-b border-[#5b7c6f]/20">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe2 className="w-7 h-7 text-[#8b9d8a]" strokeWidth={1.5} />
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-[#f5f3ed] tracking-wide">LITHIC</span>
              <span className="text-lg font-light text-[#8b9d8a]">EARTH</span>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <a href="#archive" className="text-sm text-[#d4cfc0] hover:text-[#f5f3ed] transition font-light tracking-wide">
              Archive
            </a>
            <a href="#about" className="text-sm text-[#d4cfc0] hover:text-[#f5f3ed] transition font-light tracking-wide">
              About
            </a>
            <a href="#contribute" className="text-sm text-[#d4cfc0] hover:text-[#f5f3ed] transition font-light tracking-wide">
              Contribute
            </a>
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

      {/* Hero Section - Clean, archival feel */}
      <section className="relative min-h-screen flex items-center justify-center bg-[#2d3d34]">
        <div className="absolute inset-0 opacity-60">
          <GlobeScene />
        </div>
        
        <div className="absolute inset-0 bg-gradient-to-b from-[#2d3d34]/80 via-[#2d3d34]/60 to-[#2d3d34]" />
        
        <div className="relative z-10 max-w-6xl mx-auto px-6 text-center pt-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
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
              LithicEarth preserves the human experience of place—a continuous record 
              built by people, for the future. Every image anchors a moment. Together, 
              they become something larger: a living map of change, memory, and stewardship.
            </p>

            {/* Simple stats */}
            <div className="flex justify-center gap-16 mb-16 text-center">
              <div>
                <div className="text-4xl font-light text-[#8b9d8a] mb-1">0</div>
                <div className="text-[#b5b0a0] text-xs tracking-widest font-light">PHOTOGRAPHS</div>
              </div>
              <div className="border-l border-[#5b7c6f]/30"></div>
              <div>
                <div className="text-4xl font-light text-[#8b9d8a] mb-1">0</div>
                <div className="text-[#b5b0a0] text-xs tracking-widest font-light">LOCATIONS</div>
              </div>
              <div className="border-l border-[#5b7c6f]/30"></div>
              <div>
                <div className="text-4xl font-light text-[#8b9d8a] mb-1">∞</div>
                <div className="text-[#b5b0a0] text-xs tracking-widest font-light">YEARS AHEAD</div>
              </div>
            </div>

            {/* CTAs - Heritage style */}
            <div className="flex flex-wrap gap-4 justify-center">
              <motion.a
                href="#archive"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-3 px-8 py-3.5 bg-[#5b7c6f] text-[#f5f3ed] font-light text-sm tracking-wide hover:bg-[#6b8c7f] transition border border-[#4a6b5e]"
              >
                <Map className="w-4 h-4" strokeWidth={1.5} />
                Explore Archive
              </motion.a>

              <motion.a
                href="/game"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-3 px-8 py-3.5 bg-transparent text-[#d4cfc0] font-light text-sm tracking-wide hover:bg-[#3d4f44] transition border border-[#5b7c6f]"
              >
                <span className="text-base">◆</span>
                Discovery Game
              </motion.a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Archive Section - Clean grid */}
      <section id="archive" className="relative py-24 px-6 bg-[#f5f3ed]">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-8 h-px bg-[#5b7c6f]"></div>
              <span className="text-[#5b7c6f] text-xs tracking-widest font-light">THE ARCHIVE</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-light text-[#2d3d34] mb-4 tracking-wide">
              Explore by Place
            </h2>
            <p className="text-lg text-[#5b7c6f] max-w-2xl font-light leading-relaxed">
              Navigate Earth through the eyes of its documentarians—every photograph 
              georeferenced, timestamped, preserved.
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
              <p className="text-center text-[#9a9589] text-sm mt-6 font-light">
                Archive begins with first contribution
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* About Section - Thoughtful typography */}
      <section id="about" className="relative py-24 px-6 bg-[#3d4f44]">
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
            <p>
              LithicEarth documents the physical world as experienced by people—not through 
              satellites or sensors alone, but through the lens of human observation. Each 
              photograph becomes part of a permanent, accessible record.
            </p>

            <p>
              Over time, this archive becomes invaluable: tracking coastal erosion, urban 
              growth, habitat change, climate patterns. Researchers, planners, historians, 
              and communities gain access to ground-truth observations spanning decades.
            </p>

            <div className="border-l-2 border-[#5b7c6f] pl-6 my-12">
              <p className="text-xl text-[#8b9d8a] font-light italic">
                "The best time to start documenting Earth was fifty years ago. 
                The second best time is today."
              </p>
            </div>

            <p>
              Contributors maintain full attribution. Images are geotagged and timestamped 
              to archival standards. Privacy is respected. The mission is simple: preserve 
              what we see, for those who come after.
            </p>
          </div>
        </div>
      </section>

      {/* Values - Simple cards */}
      <section className="relative py-24 px-6 bg-[#f5f3ed]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-8 h-px bg-[#5b7c6f]"></div>
              <span className="text-[#5b7c6f] text-xs tracking-widest font-light">PRINCIPLES</span>
            </div>
            <h2 className="text-4xl font-light text-[#2d3d34] tracking-wide">
              What guides this work
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Clock,
                title: 'Long-term thinking',
                description: 'Building an archive meant to last generations, not quarters. Every decision considers decades ahead.'
              },
              {
                icon: Users,
                title: 'Human-centered',
                description: 'This record exists because people care. Contributors own their work, communities own their stories.'
              },
              {
                icon: Archive,
                title: 'Rigorous standards',
                description: 'Metadata integrity, geographic precision, and ethical stewardship from day one.'
              }
            ].map((value) => {
              const Icon = value.icon;
              return (
                <motion.div
                  key={value.title}
                  whileHover={{ y: -4 }}
                  className="bg-white border border-[#d4cfc0] p-8 transition-all"
                >
                  <div className="w-10 h-10 border border-[#d4cfc0] flex items-center justify-center mb-6">
                    <Icon className="w-5 h-5 text-[#5b7c6f]" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-lg font-light text-[#2d3d34] mb-3 tracking-wide">{value.title}</h3>
                  <p className="text-[#7a8a7d] leading-relaxed font-light text-sm">{value.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contribute CTA - Understated */}
      <section id="contribute" className="relative py-24 px-6 bg-[#5b7c6f]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-light text-[#f5f3ed] mb-6 tracking-wide">
            Start contributing today
          </h2>
          <p className="text-xl text-[#d4cfc0] mb-12 font-light leading-relaxed">
            Join the global network documenting Earth—one photograph, one place, one moment
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={() => setShowAuthModal(true)}
              className="px-10 py-4 bg-[#f5f3ed] text-[#2d3d34] font-light tracking-wide hover:bg-white transition border border-[#e8e6dd]"
            >
              Create Account
            </button>
            <button className="px-10 py-4 bg-transparent text-[#f5f3ed] font-light tracking-wide border border-[#8b9d8a] hover:bg-[#6b8c7f] transition">
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Footer - Clean and simple */}
      <footer className="py-12 px-6 bg-[#2d3d34] border-t border-[#3d4f44]">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Globe2 className="w-6 h-6 text-[#8b9d8a]" strokeWidth={1.5} />
              <span className="text-sm text-[#d4cfc0] font-light tracking-wide">LITHIC EARTH</span>
            </div>
            <div className="flex gap-8 text-sm text-[#b5b0a0] font-light">
              <a href="#" className="hover:text-[#d4cfc0] transition">Archive</a>
              <a href="#" className="hover:text-[#d4cfc0] transition">About</a>
              <a href="#" className="hover:text-[#d4cfc0] transition">Terms</a>
              <a href="#" className="hover:text-[#d4cfc0] transition">Privacy</a>
            </div>
          </div>
          <div className="text-center text-[#7a8a7d] text-xs font-light">
            <p>© 2026 LithicEarth · Documenting our shared planet</p>
            <p className="mt-2">Built by The Blue Duck LLC</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
